// Package secrets keeps provider credentials outside the business database.
package secrets

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Store exposes opaque references. Callers never need to know how the
// credential is encrypted or persisted.
type Store interface {
	Put(ctx context.Context, reference string, value string) error
	Get(ctx context.Context, reference string) (string, error)
}

// VaultKV is a KV v2 Vault adapter. In production VAULT_TOKEN must be injected
// by the workload identity; it is never accepted through the HTTP API.
type VaultKV struct {
	Address string
	Token   string
	Mount   string
	Client  *http.Client
}

func (v VaultKV) Put(ctx context.Context, reference string, value string) error {
	if err := v.configured(); err != nil { return err }
	body, _ := json.Marshal(map[string]any{"data": map[string]string{"api_key": value}})
	return v.request(ctx, http.MethodPost, reference, bytes.NewReader(body), nil)
}

func (v VaultKV) Get(ctx context.Context, reference string) (string, error) {
	if err := v.configured(); err != nil { return "", err }
	var result struct { Data struct { Data map[string]string `json:"data"` } `json:"data"` }
	if err := v.request(ctx, http.MethodGet, reference, nil, &result); err != nil { return "", err }
	if result.Data.Data["api_key"] == "" { return "", fmt.Errorf("secret %q has no api_key", reference) }
	return result.Data.Data["api_key"], nil
}

func (v VaultKV) configured() error {
	if strings.TrimSpace(v.Address) == "" || strings.TrimSpace(v.Token) == "" || strings.TrimSpace(v.Mount) == "" { return fmt.Errorf("Vault 未配置；无法读写模型密钥") }
	return nil
}

func (v VaultKV) request(ctx context.Context, method, reference string, body io.Reader, target any) error {
	ref := strings.Trim(reference, "/")
	if ref == "" || strings.Contains(ref, "..") { return fmt.Errorf("invalid secret reference") }
	endpoint := strings.TrimRight(v.Address, "/") + "/v1/" + strings.Trim(v.Mount, "/") + "/data/" + ref
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil { return err }
	req.Header.Set("X-Vault-Token", v.Token)
	if body != nil { req.Header.Set("Content-Type", "application/json") }
	client := v.Client; if client == nil { client = http.DefaultClient }
	resp, err := client.Do(req)
	if err != nil { return fmt.Errorf("Vault request: %w", err) }
	defer resp.Body.Close()
	contents, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 { return fmt.Errorf("Vault returned %d", resp.StatusCode) }
	if target != nil && len(contents) > 0 { if err := json.Unmarshal(contents, target); err != nil { return fmt.Errorf("decode Vault response: %w", err) } }
	return nil
}
