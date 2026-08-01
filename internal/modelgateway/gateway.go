// Package modelgateway normalizes approved model providers into one structured
// analysis contract. It deliberately receives a secret reference, not a key.
package modelgateway

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/heatscope/heatscope/internal/secrets"
)

const CandidateSchemaVersion = "2026-07-29.1"

type Profile struct {
	ID, Provider, Name, BaseURL, ModelID, WireAPI, ReasoningEffort, SecretRef string
	TimeoutSeconds, MaxOutputTokens int
}

type Evidence struct {
	DataLevel string         `json:"data_level"`
	Project   map[string]any `json:"project"`
	Observations []Observation `json:"observations"`
	KnownEvidenceRefs []string `json:"known_evidence_refs"`
}

type Observation struct {
	Ref, ElementName, ModuleID string
	ClickCount int64
}

type Validation struct { Metric string `json:"metric"`; Guardrail string `json:"guardrail"` }
type Candidate struct {
	Claim string `json:"claim"`
	EvidenceRefs []string `json:"evidenceRefs"`
	Confidence string `json:"confidence"`
	Action string `json:"action"`
	Validation Validation `json:"validation"`
	Assumptions []string `json:"assumptions"`
}
type Blueprint struct {
	Title string `json:"title"`
	InformationArchitecture []string `json:"informationArchitecture"`
	PrimaryCTA string `json:"primaryCta"`
	DesktopNotes []string `json:"desktopNotes"`
	MobileNotes []string `json:"mobileNotes"`
}
type Bundle struct {
	Insights []Candidate `json:"insights"`
	Plans []Candidate `json:"plans"`
	Blueprint Blueprint `json:"blueprint"`
}
type Result struct {
	Bundle Bundle
	RawResponse map[string]any
	InputTokens, OutputTokens int
	Latency time.Duration
}

type Gateway struct { Secrets secrets.Store; HTTPClient *http.Client; Resolver *net.Resolver }

// ValidateEndpoint is used before persisting a profile and again for every
// execution. The latter guards against DNS changes after configuration.
func (g Gateway) ValidateEndpoint(baseURL, wireAPI string) error {
	_, err := g.endpoint(baseURL, wireAPI)
	return err
}

func (g Gateway) Run(ctx context.Context, profile Profile, evidence Evidence) (Result, error) {
	if g.Secrets == nil { return Result{}, fmt.Errorf("模型密钥服务未配置") }
	if profile.SecretRef == "" { return Result{}, fmt.Errorf("模型档案尚未写入密钥") }
	endpoint, err := g.endpoint(profile.BaseURL, profile.WireAPI)
	if err != nil { return Result{}, err }
	key, err := g.Secrets.Get(ctx, profile.SecretRef)
	if err != nil { return Result{}, fmt.Errorf("读取模型密钥失败: %w", err) }
	prompt, err := promptFor(evidence)
	if err != nil { return Result{}, err }
	body, err := requestBody(profile, prompt)
	if err != nil { return Result{}, err }
	timeout := time.Duration(profile.TimeoutSeconds) * time.Second
	if timeout <= 0 { timeout = 90 * time.Second }
	requestCtx, cancel := context.WithTimeout(ctx, timeout); defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil { return Result{}, err }
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	client := g.HTTPClient
	if client == nil {
		client, err = g.pinnedClient(profile.BaseURL, timeout)
		if err != nil { return Result{}, err }
	}
	started := time.Now()
	resp, err := client.Do(req)
	latency := time.Since(started)
	if err != nil { return Result{}, fmt.Errorf("模型请求失败: %w", err) }
	defer resp.Body.Close()
	contents, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 { return Result{}, fmt.Errorf("模型服务返回 %d", resp.StatusCode) }
	var raw map[string]any
	if err := json.Unmarshal(contents, &raw); err != nil { return Result{}, fmt.Errorf("模型响应不是 JSON: %w", err) }
	output := outputText(profile.WireAPI, raw)
	bundle, err := parseBundle(output)
	if err != nil { return Result{}, err }
	if err := ValidateBundle(bundle, evidence); err != nil { return Result{}, err }
	in, out := usage(raw)
	return Result{Bundle: bundle, RawResponse: raw, InputTokens: in, OutputTokens: out, Latency: latency}, nil
}

func (g Gateway) endpoint(baseURL, wireAPI string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" { return "", fmt.Errorf("模型地址必须为有效 HTTPS URL") }
	if _, err := g.resolvePublic(context.Background(), parsed.Hostname()); err != nil { return "", err }
	resource := "chat/completions"; if wireAPI == "responses" { resource = "responses" } else if wireAPI != "chat_completions" { return "", fmt.Errorf("不支持的模型协议") }
	path := strings.TrimSuffix(parsed.Path, "/")
	if !strings.HasSuffix(path, "/"+resource) { if path == "" { path = "/v1" }; parsed.Path = path + "/" + resource }
	return parsed.String(), nil
}

// pinnedClient resolves the hostname immediately before each execution and
// dials only the verified public IP. Redirects are rejected. Together these
// rules prevent DNS rebinding and redirect-based SSRF after profile approval.
func (g Gateway) pinnedClient(baseURL string, timeout time.Duration) (*http.Client, error) {
	parsed, err := url.Parse(baseURL); if err != nil { return nil, err }
	address, err := g.resolvePublic(context.Background(), parsed.Hostname()); if err != nil { return nil, err }
	port := parsed.Port(); if port == "" { port = "443" }
	pinned := net.JoinHostPort(address.String(), port)
	dialer := &net.Dialer{Timeout: timeout}
	transport := &http.Transport{ForceAttemptHTTP2: true, DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) { return dialer.DialContext(ctx, network, pinned) }}
	return &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}, nil
}

func (g Gateway) resolvePublic(ctx context.Context, hostname string) (netip.Addr, error) {
	resolver := g.Resolver; if resolver == nil { resolver = net.DefaultResolver }
	addresses, err := resolver.LookupNetIP(ctx, "ip", hostname)
	if err != nil || len(addresses) == 0 { return netip.Addr{}, fmt.Errorf("模型域名无法解析") }
	for _, address := range addresses { if blocked(address) { return netip.Addr{}, fmt.Errorf("模型地址解析到受限网络") } }
	return addresses[0], nil
}

func blocked(address netip.Addr) bool {
	return !address.IsValid() || address.IsLoopback() || address.IsPrivate() || address.IsLinkLocalUnicast() || address.IsUnspecified() || address.IsMulticast() || address.IsInterfaceLocalMulticast() || address.IsLinkLocalMulticast()
}

func requestBody(profile Profile, prompt string) ([]byte, error) {
	limit := profile.MaxOutputTokens; if limit <= 0 { limit = 4000 }
	if profile.WireAPI == "responses" {
		payload := map[string]any{"model": profile.ModelID, "store": false, "max_output_tokens": limit, "input": []map[string]any{{"role": "developer", "content": []map[string]string{{"type": "input_text", "text": systemPrompt}}}, {"role": "user", "content": []map[string]string{{"type": "input_text", "text": prompt}}}}}
		if profile.ReasoningEffort != "" { payload["reasoning"] = map[string]string{"effort": profile.ReasoningEffort} }
		return json.Marshal(payload)
	}
	return json.Marshal(map[string]any{"model": profile.ModelID, "temperature": 0.2, "max_tokens": limit, "response_format": map[string]string{"type": "json_object"}, "messages": []map[string]string{{"role": "system", "content": systemPrompt}, {"role": "user", "content": prompt}}})
}

const systemPrompt = "你是严格遵守证据边界的页面增长分析师。只使用输入证据。L1 点击观察绝不能声称 CTR、转化、留存、收入已提升或因果关系。返回严格 JSON，不含 Markdown。"

func promptFor(evidence Evidence) (string, error) {
	encoded, err := json.Marshal(evidence)
	if err != nil { return "", err }
	return "基于以下冻结证据包生成候选。每个候选需引用 evidenceRefs，含 action、validation 和 assumptions。输出对象必须符合：{\"insights\":[Candidate],\"plans\":[Candidate],\"blueprint\":{\"title\":\"\",\"informationArchitecture\":[\"\"],\"primaryCta\":\"\",\"desktopNotes\":[\"\"],\"mobileNotes\":[\"\"]}}。证据包：" + string(encoded), nil
}

func outputText(wireAPI string, raw map[string]any) string {
	if wireAPI == "responses" {
		if text, ok := raw["output_text"].(string); ok { return text }
		if output, ok := raw["output"].([]any); ok { for _, item := range output { if object, ok := item.(map[string]any); ok { if content, ok := object["content"].([]any); ok { for _, bit := range content { if piece, ok := bit.(map[string]any); ok { if text, ok := piece["text"].(string); ok { return text } } } } } } }
		return ""
	}
	if choices, ok := raw["choices"].([]any); ok && len(choices) > 0 { if choice, ok := choices[0].(map[string]any); ok { if message, ok := choice["message"].(map[string]any); ok { if content, ok := message["content"].(string); ok { return content } } } }
	return ""
}

func parseBundle(contents string) (Bundle, error) {
	first, last := strings.Index(contents, "{"), strings.LastIndex(contents, "}")
	if first < 0 || last < first { return Bundle{}, fmt.Errorf("模型未返回可识别的 JSON 方案") }
	var bundle Bundle
	if err := json.Unmarshal([]byte(contents[first:last+1]), &bundle); err != nil { return Bundle{}, fmt.Errorf("模型方案 JSON 无效: %w", err) }
	return bundle, nil
}

func ValidateBundle(bundle Bundle, evidence Evidence) error {
	if len(bundle.Insights) == 0 || len(bundle.Plans) == 0 || strings.TrimSpace(bundle.Blueprint.Title) == "" { return fmt.Errorf("模型输出缺少洞察、方案或 UI 蓝图") }
	known := make(map[string]struct{}, len(evidence.KnownEvidenceRefs)); for _, reference := range evidence.KnownEvidenceRefs { known[reference] = struct{}{} }
	for _, candidate := range append(append([]Candidate{}, bundle.Insights...), bundle.Plans...) {
		if strings.TrimSpace(candidate.Claim) == "" || strings.TrimSpace(candidate.Action) == "" || strings.TrimSpace(candidate.Validation.Metric) == "" { return fmt.Errorf("候选缺少结论、页面动作或验证指标") }
		if candidate.Confidence != "low" && candidate.Confidence != "medium" && candidate.Confidence != "high" { return fmt.Errorf("候选置信度不合法") }
		if len(candidate.EvidenceRefs) == 0 { return fmt.Errorf("候选未引用证据") }
		for _, reference := range candidate.EvidenceRefs { if _, ok := known[reference]; !ok { return fmt.Errorf("候选引用了未冻结证据 %q", reference) } }
		if evidence.DataLevel == "L1" && forbiddenL1(candidate.Claim+" "+candidate.Action) { return fmt.Errorf("L1 点击观察不能输出转化、留存或因果结论") }
	}
	return nil
}

func forbiddenL1(value string) bool { return strings.Contains(value, "转化提升") || strings.Contains(value, "留存提升") || strings.Contains(value, "收入提升") || strings.Contains(value, "必然提升") || strings.Contains(value, "导致") }
func usage(raw map[string]any) (int, int) { usage, _ := raw["usage"].(map[string]any); return number(usage["input_tokens"], usage["prompt_tokens"]), number(usage["output_tokens"], usage["completion_tokens"]) }
func number(values ...any) int { for _, value := range values { switch value := value.(type) { case float64: return int(value); case int: return value } }; return 0 }

func HashEvidence(evidence Evidence) (string, error) {
	sort.Slice(evidence.Observations, func(i, j int) bool { return evidence.Observations[i].Ref < evidence.Observations[j].Ref })
	sort.Strings(evidence.KnownEvidenceRefs)
	encoded, err := json.Marshal(evidence); if err != nil { return "", err }
	sum := sha256.Sum256(encoded); return hex.EncodeToString(sum[:]), nil
}
