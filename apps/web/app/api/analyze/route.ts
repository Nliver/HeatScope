import { promises as dns } from 'node:dns';
import net from 'node:net';
import { NextResponse } from 'next/server';
import { buildProviderRequest, extractProviderText, isProviderProtocol } from '../../../lib/model-protocol';
import type { ProviderProtocol } from '../../../lib/model-protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Model = { id: string; name: string; baseUrl: string; model: string; protocol: ProviderProtocol; apiKey: string; reasoningEffort?: string; timeoutSeconds?: number };
type Mode = 'analysis' | 'design' | 'html' | 'knowledge';
type ErrorReason = 'RATE_LIMIT' | 'QUOTA_EXCEEDED' | 'AUTH_ERROR' | 'CONTENT_FILTER' | 'MODEL_NOT_SUPPORT' | 'TIMEOUT' | 'STREAM_INTERRUPTED' | 'INVALID_HTML' | 'UPSTREAM_ERROR' | 'UNKNOWN';
type ProviderError = { provider: string; protocol?: ProviderProtocol; code?: string; httpStatus?: number; reason: ErrorReason; message: string; raw?: string; retryable: boolean; retryAfterMs?: number; occurredAt: string };

const privateIPv4 = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
function privateIPv6(ip: string) { const value = ip.toLowerCase(); return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'); }
function asString(value: unknown, max = 12000) {
  return typeof value === 'string'
    ? value.slice(0, max)
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
      .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
      .replace(/(api[-_ ]?key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1***')
    : '';
}

const reasonCopy: Record<ErrorReason, string> = {
  RATE_LIMIT: '模型服务商触发了限流，请稍后重试。',
  QUOTA_EXCEEDED: '模型服务商的额度或计费余额不足，请检查账户配置。',
  AUTH_ERROR: '模型 API Key 无效或没有调用权限，请检查模型配置。',
  CONTENT_FILTER: '请求被模型服务商的内容安全策略拦截。',
  MODEL_NOT_SUPPORT: '该模型不支持当前 HTML 输出能力，请更换模型或调整输出要求。',
  TIMEOUT: '模型在设定时间内未返回，请稍后重试或调高超时时间。',
  STREAM_INTERRUPTED: '模型流式响应中途断开，请重试。',
  INVALID_HTML: '模型返回了内容，但没有通过可运行 HTML 校验。',
  UPSTREAM_ERROR: '模型服务商暂时不可用，请稍后重试。',
  UNKNOWN: '模型调用失败，请查看原始报错或检查模型配置。',
};

function providerLabel(model: Model) {
  try { return new URL(model.baseUrl).hostname; } catch { return model.name || '模型服务商'; }
}

function inferErrorReason(message: string, status?: number): ErrorReason {
  const normalized = message.toLowerCase();
  if (status === 401 || status === 403 || /unauthor|api key|apikey|permission|forbidden/.test(normalized)) return 'AUTH_ERROR';
  if (status === 402 || /quota|billing|insufficient|余额|额度|计费/.test(normalized)) return 'QUOTA_EXCEEDED';
  if (status === 429 || /rate.?limit|too many requests|限流/.test(normalized)) return 'RATE_LIMIT';
  if (status === 408 || status === 504 || /timeout|timed out|aborted|超时/.test(normalized)) return 'TIMEOUT';
  if (/content.?filter|safety|moderation|blocked|审核|安全策略/.test(normalized)) return 'CONTENT_FILTER';
  if (/html.*(support|return|response)|支持.*html|not support.*html|unsupported.*format|cannot.*html|unable.*html/.test(normalized)) return 'MODEL_NOT_SUPPORT';
  if (status && status >= 500) return 'UPSTREAM_ERROR';
  return 'UNKNOWN';
}

function normalizeProviderError(model: Model, input: { message?: string; raw?: string; code?: string; httpStatus?: number; reason?: ErrorReason; retryAfterMs?: number }): ProviderError {
  const raw = asString(input.raw || input.message || '', 2048);
  const reason = input.reason || inferErrorReason(input.message || raw, input.httpStatus);
  const retryable = !['AUTH_ERROR', 'CONTENT_FILTER', 'MODEL_NOT_SUPPORT', 'QUOTA_EXCEEDED'].includes(reason);
  return {
    provider: providerLabel(model),
    protocol: model.protocol,
    ...(input.code ? { code: asString(input.code, 120) } : {}),
    ...(input.httpStatus ? { httpStatus: input.httpStatus } : {}),
    reason,
    message: reason === 'INVALID_HTML' && input.message ? input.message : reasonCopy[reason],
    ...(raw ? { raw } : {}),
    retryable,
    ...(input.retryAfterMs ? { retryAfterMs: input.retryAfterMs } : {}),
    occurredAt: new Date().toISOString(),
  };
}

async function assertPublicEndpoint(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('模型地址不是有效 URL。'); }
  if (url.protocol !== 'https:') throw new Error('模型地址必须使用 HTTPS。');
  if (url.username || url.password || url.port && !['443', ''].includes(url.port)) throw new Error('模型地址不能包含凭据或非标准端口。');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('模型地址不能指向本机或内部域名。');
  if (net.isIP(host)) { if (privateIPv4(host) || privateIPv6(host)) throw new Error('模型地址不能指向私有网络。'); return url; }
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => privateIPv4(item.address) || privateIPv6(item.address))) throw new Error('模型地址解析到了私有网络，已拒绝请求。');
  return url;
}

function stripCodeFence(text: string) {
  return text.trim().replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
function escapeLiteralControlsInStrings(text: string) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (escaped) { output += char; escaped = false; continue; }
    if (char === '\\') { output += char; escaped = true; continue; }
    if (char === '"') { output += char; inString = !inString; continue; }
    if (inString && char === '\n') { output += '\\n'; continue; }
    if (inString && char === '\r') { output += '\\r'; continue; }
    if (inString && char === '\t') { output += '\\t'; continue; }
    output += char;
  }
  return output;
}
function extractBalanced(text: string, open: '{' | '[', startIndex = text.indexOf(open)) {
  if (startIndex < 0) return '';
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return '';
}
function parseJsonCandidate(text: string) {
  const repaired = escapeLiteralControlsInStrings(text).replace(/,\s*([}\]])/g, '$1');
  const candidates = repaired === text ? [text] : [text, repaired];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === 'string') {
        try { return JSON.parse(parsed) as unknown; } catch { return parsed; }
      }
      return parsed;
    } catch { /* noop */ }
  }
  return undefined;
}
function toOutput(json: unknown, parseMode: 'strict' | 'salvaged') {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as { summary?: unknown; insights?: unknown; blueprint?: unknown };
  const insights = Array.isArray(record.insights) ? record.insights.slice(0, 8).map((item, index) => {
    const insight = asRecord(item);
    const priority = designText(insight.priority, 'P2');
    return {
      id: designText(insight.id, `I${index + 1}`),
      priority: ['P0', 'P1', 'P2'].includes(priority) ? priority : 'P2',
      title: designText(insight.title, '待确认的模型发现'),
      evidence: designTextArray(insight.evidence, ['需补充数据依据']),
      interpretation: designText(insight.interpretation, '需要结合页面位置和结果事件进一步解释。'),
      action: designText(insight.action, '补充模块归因和验证事件后再决定改版。'),
      validation: designText(insight.validation, '补充曝光、目标开始和目标完成数据。'),
      guardrail: designText(insight.guardrail, '不得把点击次数直接表述为转化或留存。'),
    };
  }) : [];
  return {
    summary: asString(record.summary, 5000) || (parseMode === 'salvaged' ? '模型返回了非标准 JSON，系统已恢复可读摘要。' : '模型未返回摘要。'),
    insights,
    blueprint: typeof record.blueprint === 'object' && record.blueprint ? record.blueprint : undefined,
    parseMode,
  };
}
function parseAnalysisOutput(text: string) {
  const cleaned = stripCodeFence(text);
  const direct = toOutput(parseJsonCandidate(cleaned), 'strict');
  if (direct) return direct;

  const objectCandidate = extractBalanced(cleaned, '{');
  if (objectCandidate) {
    const extracted = toOutput(parseJsonCandidate(objectCandidate), 'salvaged');
    if (extracted?.insights.length || extracted?.summary) return extracted;
  }

  const insightsKey = cleaned.search(/"insights"\s*:/);
  const insightsCandidate = insightsKey >= 0 ? extractBalanced(cleaned, '[', cleaned.indexOf('[', insightsKey)) : '';
  const summaryMatch = cleaned.match(/"summary"\s*:\s*"([\s\S]*?)"\s*(,|\})/);
  const insights = insightsCandidate ? parseJsonCandidate(insightsCandidate) : undefined;
  return {
    summary: summaryMatch?.[1] ? asString(summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'), 5000) : '模型返回了非标准 JSON，已降级为纯文本摘要。',
    insights: Array.isArray(insights) ? insights.slice(0, 8) : [],
    parseMode: 'raw' as const,
  };
}

function parseKnowledgeOutput(text: string) {
  const cleaned = stripCodeFence(text);
  const candidate = parseJsonCandidate(cleaned) || parseJsonCandidate(extractBalanced(cleaned, '{'));
  const record = asRecord(candidate);
  const rawPrinciples = Array.isArray(record.principles) ? record.principles : Array.isArray(record.entries) ? record.entries : [];
  const principles = rawPrinciples.slice(0, 20).map((item, index) => {
    const entry = asRecord(item);
    const severity = designText(entry.severity, 'P1');
    return {
      id: designText(entry.id, `synth-${index + 1}`),
      category: designText(entry.category, '待分类'),
      severity: ['P0', 'P1', 'P2'].includes(severity) ? severity : 'P1',
      title: designText(entry.title, `运营原则 ${index + 1}`),
      principle: designText(entry.principle, designText(entry.summary, '请补充原则定义。')),
      evidence: designText(entry.evidence, '需补充案例证据。'),
      action: designText(entry.action, '请补充可执行动作。'),
      validation: designText(entry.validation, '请补充验证事件与观察窗口。'),
      guardrail: designText(entry.guardrail, '不得把点击次数直接表述为转化或留存。'),
      tags: designTextArray(entry.tags),
    };
  });
  return { summary: designText(record.summary, '模型已归纳运营方法论。'), principles, parseMode: candidate ? 'strict' as const : 'raw' as const };
}

type DesignRecord = Record<string, unknown>;

function asRecord(value: unknown): DesignRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DesignRecord : {};
}

function designText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return fallback;
  const record = asRecord(value);
  const parts = [record.title, record.body, record.note, record.description, record.text]
    .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.join(' · ') || fallback;
}

function designTextArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => designText(item)).filter(Boolean);
}

function normalizePageDesign(value: unknown): DesignRecord | undefined {
  const source = asRecord(value);
  if (!Object.keys(source).length) return undefined;
  const theme = asRecord(source.theme);
  const hero = asRecord(source.hero);
  const sections = Array.isArray(source.sections) ? source.sections.slice(0, 12).map((rawSection) => {
    const section = asRecord(rawSection);
    const kind = ['metrics', 'cards', 'split', 'timeline', 'faq', 'cta', 'proof', 'copy'].includes(String(section.kind)) ? String(section.kind) : 'copy';
    const common = { kind, title: designText(section.title, '未命名区块') };
    if (kind === 'metrics') return { ...common, description: designText(section.description), items: (Array.isArray(section.items) ? section.items : []).slice(0, 12).map((item) => { const record = asRecord(item); return { label: designText(record.label, '指标'), value: designText(record.value, '-'), note: designText(record.note) }; }) };
    if (kind === 'cards') return { ...common, description: designText(section.description), layout: ['grid', 'rail', 'stack'].includes(String(section.layout)) ? section.layout : 'grid', items: (Array.isArray(section.items) ? section.items : []).slice(0, 12).map((item) => { const record = asRecord(item); return { title: designText(record.title, '信息卡片'), body: designText(record.body), note: designText(record.note), cta: designText(record.cta) }; }) };
    if (kind === 'split') return { ...common, description: designText(section.description), leftTitle: designText(section.leftTitle, '重点信息'), leftBody: designText(section.leftBody), rightTitle: designText(section.rightTitle, '下一步'), rightItems: designTextArray(section.rightItems) };
    if (kind === 'timeline') return { ...common, description: designText(section.description), steps: (Array.isArray(section.steps) ? section.steps : []).slice(0, 12).map((item) => { const record = asRecord(item); return { title: designText(record.title, '步骤'), body: designText(record.body) }; }) };
    if (kind === 'faq') return { ...common, description: designText(section.description), items: (Array.isArray(section.items) ? section.items : []).slice(0, 12).map((item) => { const record = asRecord(item); return { question: designText(record.question, '常见问题'), answer: designText(record.answer) }; }) };
    if (kind === 'cta') return { ...common, description: designText(section.description), primaryCta: designText(section.primaryCta, '开始下一步'), secondaryCta: designText(section.secondaryCta, '了解详情') };
    if (kind === 'proof') return { ...common, items: designTextArray(section.items, ['待补充证明材料']) };
    return { ...common, body: designText(section.body, designText(section.description)) };
  }) : [];
  return {
    ...source,
    pageName: designText(source.pageName, '页面改版方案'),
    strategy: designText(source.strategy),
    audience: designText(source.audience),
    desktop: designText(source.desktop),
    mobile: designText(source.mobile),
    theme: {
      background: designText(theme.background, '#F4F7FA'), surface: designText(theme.surface, '#FFFFFF'), surfaceAlt: designText(theme.surfaceAlt, '#F7FAFC'), accent: designText(theme.accent, '#0A9C8A'), accentSoft: designText(theme.accentSoft, '#E5F5F1'), text: designText(theme.text, '#15232D'), muted: designText(theme.muted, '#687782'), border: designText(theme.border, '#DCE5E9'), radius: designText(theme.radius, '16px'), motion: designText(theme.motion, 'ease'), tone: designText(theme.tone, '清晰克制'),
    },
    hero: {
      eyebrow: designText(hero.eyebrow), title: designText(hero.title, '让用户更快开始'), description: designText(hero.description), primaryCta: designText(hero.primaryCta, '开始下一步'), secondaryCta: designText(hero.secondaryCta, '了解详情'), supportingPoints: designTextArray(hero.supportingPoints),
    },
    sections,
    events: (Array.isArray(source.events) ? source.events : []).slice(0, 16).map((event) => { const record = asRecord(event); return { event: designText(record.event, 'page_action'), properties: designText(record.properties), purpose: designText(record.purpose) }; }),
    notes: designTextArray(source.notes),
  };
}

function sanitizeRenderHtml(value: unknown, brandColor: string) {
  const raw = designText(value).trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    // Generated pages are previews/export artifacts. Keep their controls visible,
    // but make links, forms and submit inputs inert so they cannot navigate away.
    .replace(/\s+(?:href|target|rel|action|method)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<button\b(?![^>]*\btype\s*=)/gi, '<button type="button"')
    .replace(/(<input\b[^>]*\btype\s*=\s*)(?:"submit"|'submit'|submit)/gi, '$1"button"');
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(brandColor) ? brandColor.toUpperCase() : '#0A9C8A';
  const frameHead = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:;"><style>:root{--brand:${safeColor}}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,"PingFang SC",sans-serif;color:#16222E;background:#F7F9FB}button,a,input{font:inherit}</style>`;
  return /<html[\s>]/i.test(cleaned) ? cleaned.replace(/<head[^>]*>/i, (head) => `${head}${frameHead}`) : `<!doctype html><html><head>${frameHead}</head><body>${cleaned}</body></html>`;
}

function htmlValidationMessage(text: string) {
  const cleaned = stripCodeFence(text).trim();
  if (!cleaned) return '模型返回为空，未生成 HTML。';
  if (cleaned.length < 120) return '模型返回内容过短，不足以构成可运行的 HTML 页面。';
  if (/\{\{[\s\S]*?\}\}/.test(cleaned)) return '模型返回中仍包含未替换的模板占位符。';
  if (!/<(html|body|main|div|section|article)[\s>]/i.test(cleaned)) return '模型返回不是可解析的 HTML 文档或页面片段。';
  return undefined;
}

function parseHtmlOutput(text: string, brandColor: string) {
  const cleaned = stripCodeFence(text);
  const direct = parseJsonCandidate(cleaned);
  if (direct && typeof direct === 'object') {
    const record = asRecord(direct);
    const html = designText(record.html || record.code || asRecord(record.render).code);
    if (html && !htmlValidationMessage(html)) return { summary: designText(record.summary, '模型已返回纯前端 HTML 页面。'), html: sanitizeRenderHtml(html, brandColor), parseMode: 'strict' as const };
  }
  if (htmlValidationMessage(cleaned)) return undefined;
  const htmlStart = cleaned.search(/<!doctype\s+html|<html[\s>]|<body[\s>]|<main[\s>]|<div[\s>]/i);
  const html = sanitizeRenderHtml(htmlStart >= 0 ? cleaned.slice(htmlStart) : cleaned, brandColor);
  if (!html || html.length < 120 || /\{\{[\s\S]*?\}\}/.test(html) || !/<(html|body|main|div|section|article)[\s>]/i.test(html)) return undefined;
  return { summary: '模型已返回纯前端 HTML 页面。', html, parseMode: 'raw' as const };
}

function normalizeGrowthPlan(value: unknown, evidenceValue: unknown): DesignRecord | undefined {
  const plan = asRecord(value); const evidence = asRecord(evidenceValue);
  if (!Array.isArray(plan.diagnosis) || !Array.isArray(plan.changes)) return undefined;
  const diagnosis = plan.diagnosis.slice(0, 12).map((item, index) => { const record = asRecord(item); const evidenceText = designText(record.evidence); const severityValue = designText(record.severity); return { id: designText(record.id, `D${index + 1}`), evidence: evidenceText || '需补充数据', problem: designText(record.problem), severity: evidenceText ? (['high', 'mid', 'low', '启发式建议'].includes(severityValue) ? severityValue : '启发式建议') : '启发式建议' }; });
  const diagnosisIds = new Set(diagnosis.map((item) => item.id));
  const changes = plan.changes.slice(0, 12).map((item, index) => { const record = asRecord(item); const refs = designTextArray(record.evidence_ref); return { module: designText(record.module, `改版模块 ${index + 1}`), before: designText(record.before), after: designText(record.after), rationale: designText(record.rationale), evidenceRef: refs, priority: Math.max(1, Number(record.priority) || index + 1) }; });
  const invalidChange = changes.find((change) => !change.evidenceRef.length || change.evidenceRef.some((id) => !diagnosisIds.has(id)));
  if (invalidChange) throw new Error(`UI 方案证据链未闭合：${invalidChange.module} 的 evidence_ref 无效，请让模型按规范重试。`);
  const strategy = asRecord(plan.strategy); const visualSpec = asRecord(plan.visual_spec); const render = asRecord(plan.render);
  const brandColor = /^#[0-9A-Fa-f]{6}$/.test(designText(evidence.brandColor)) ? designText(evidence.brandColor).toUpperCase() : '#0A9C8A';
  const goal = designText(strategy.goal, designText(evidence.goal)); const audience = designText(strategy.audience, designText(evidence.audience, '2B'));
  const primaryCta = designText(evidence.primaryCta, '开始下一步'); const baseline = asRecord(evidence.pageBaseline);
  const renderHtml = sanitizeRenderHtml(render.code, brandColor);
  const topChange = [...changes].sort((a, b) => a.priority - b.priority)[0];
  const cards = changes.map((change) => ({ title: change.module, body: `${change.before ? `现状：${change.before}。` : ''}${change.after ? `改版：${change.after}` : ''}`, note: `${change.evidenceRef.join(' / ')} · ${change.rationale}`, cta: change.priority === 1 ? primaryCta : undefined }));
  return {
    pageName: designText(baseline.pageTitle, (() => { try { return new URL(designText(evidence.url)).hostname; } catch { return '页面改版方案'; } })()),
    strategy: topChange?.after || `围绕${goal}重排页面信息与行动路径`,
    audience: `${audience} · ${designText(evidence.brandTone)}`,
    theme: { background: '#F4F7FA', surface: '#FFFFFF', surfaceAlt: '#EEF3F7', accent: brandColor, accentSoft: `${brandColor}18`, text: '#16222E', muted: '#5A6B7B', border: '#D7E0E8', radius: '12px', motion: 'cubic-bezier(.2,.8,.2,1)', tone: designText(evidence.brandTone, '清晰、克制') },
    hero: { eyebrow: `${audience} · 数据驱动改版`, title: topChange?.after || `用更清晰的路径完成${goal}`, description: topChange?.rationale || diagnosis[0]?.problem || '根据热力图和点击证据调整信息层级。', primaryCta, secondaryCta: '查看关键证据', supportingPoints: diagnosis.slice(0, 3).map((item) => `${item.id} ${item.problem}`) },
    sections: cards.length ? [{ kind: 'cards', title: '证据驱动的模块改版', description: '每一项改动都可追溯到诊断证据。', layout: 'stack', items: cards }] : [],
    desktop: designText(visualSpec.spacing, '桌面端采用 F/Z 型扫视路径，主行动位于首屏黄金区。'),
    mobile: '移动端使用单列节奏和拇指可达的主行动区，保持证据定义与桌面端一致。',
    events: [{ event: 'module_exposure', properties: 'module_id, evidence_ref, page_version', purpose: '验证改版模块是否被用户看到。' }, { event: 'cta_click', properties: 'module_id, cta_type, evidence_ref', purpose: '比较主行动在各证据模块中的承接。' }, { event: 'goal_complete', properties: 'goal_type, page_version, experiment_id', purpose: '验证真实业务结果，避免用点击代替转化。' }],
    notes: diagnosis.map((item) => `${item.id} · ${item.evidence}`), diagnosis, changes,
    visualSpec: { primary: designText(visualSpec.primary, `${brandColor} 及其透明阶`), typeScale: designText(visualSpec.type_scale), spacing: designText(visualSpec.spacing), audienceNotes: designText(visualSpec.audience_notes) },
    renderHtml, schemaVersion: 'growth-ui-v1',
  };
}

function parseDesignOutput(text: string, evidence?: unknown) {
  const cleaned = stripCodeFence(text);
  const direct = parseJsonCandidate(cleaned) as { summary?: unknown; design?: unknown; diagnosis?: unknown } | undefined;
  const directGrowth = normalizeGrowthPlan(direct, evidence);
  if (directGrowth) return { summary: '模型已按增长诊断 UI 规范生成闭合证据链与可渲染页面。', design: directGrowth, parseMode: 'strict' as const };
  if (direct && typeof direct === 'object' && direct.design && typeof direct.design === 'object') {
    return {
      summary: asString(direct.summary, 5000) || '模型已生成页面设计。',
      design: normalizePageDesign(direct.design),
      parseMode: 'strict' as const,
    };
  }

  const objectCandidate = extractBalanced(cleaned, '{');
  if (objectCandidate) {
    const extracted = parseJsonCandidate(objectCandidate) as { summary?: unknown; design?: unknown; diagnosis?: unknown } | undefined;
    const extractedGrowth = normalizeGrowthPlan(extracted, evidence);
    if (extractedGrowth) return { summary: '模型输出已恢复，并通过增长诊断证据链校验。', design: extractedGrowth, parseMode: 'salvaged' as const };
    if (extracted && typeof extracted === 'object' && extracted.design && typeof extracted.design === 'object') {
      return {
        summary: asString(extracted.summary, 5000) || '模型已生成页面设计。',
        design: normalizePageDesign(extracted.design),
        parseMode: 'salvaged' as const,
      };
    }
  }

  const designKey = cleaned.search(/"design"\s*:/);
  const designCandidate = designKey >= 0 ? extractBalanced(cleaned, '{', cleaned.indexOf('{', designKey)) : '';
  const design = designCandidate ? parseJsonCandidate(designCandidate) : undefined;
  return {
    summary: design ? '模型返回了非标准 JSON，系统已恢复页面设计。' : '模型返回了非标准 JSON，暂未恢复出页面设计。',
    design: normalizePageDesign(design),
    parseMode: design ? 'salvaged' as const : 'raw' as const,
  };
}

function promptForAnalysis(evidence: unknown, local: unknown, knowledge: unknown[] = []) {
  return `你是资深增长产品与运营分析师。基于下方同一份证据包、本地规则结果和运营知识库，只给出分析反馈，不要生成页面设计。\n\n规则：\n1. 点击次数和热力图只能支持点击观察；没有 PV/UV、曝光、目标事件或实验时，不得声称 CTR、转化、留存、收入或因果提升。\n2. 热力图截图只提供空间背景，数值以行为数据表为准。\n3. 同名元素缺少 module_id/selector 时，必须指出不可归因，不能猜测具体位置。\n4. 每条建议必须含证据、替代解释、具体动作、验证指标和护栏。\n5. 运营知识库是方法论约束，不得替代当前页面的实际证据。\n6. 只返回 JSON，不要写页面方案，不要写代码，不要输出 Markdown。\n\nJSON 格式：\n{"summary":"...","insights":[{"priority":"P0|P1|P2","title":"...","evidence":["..."],"interpretation":"...","action":"...","validation":"...","guardrail":"..."}]}\n\n证据包：\n${JSON.stringify(evidence)}\n\n本地规则结果：\n${JSON.stringify(local)}\n\n运营知识库（仅使用启用条目作为方法论约束）：\n${JSON.stringify(knowledge.slice(0, 24))}`;
}

function promptForKnowledge(input: unknown, existingKnowledge: unknown) {
  const source = asRecord(input);
  return `你是资深用户增长运营专家。请从下面的运营文档或页面分析案例中归纳可复用的页面增长方法论，供后续大模型诊断热力图和 Web 点击数据时引用。

要求：
1. 只提炼可迁移的原则，不复述某一页的具体 UI，也不要编造文档中不存在的指标。
2. 每条原则都要包含 category、severity（P0/P1/P2）、title、principle、evidence、action、validation、guardrail、tags。
3. evidence 必须说明来自输入的事实或数据边界；缺少结果事件时明确写“只能支持点击观察”。
4. action 必须是产品、设计或运营可以执行的动作；validation 必须包含目标事件、版本或观察窗口。
5. 识别并保留“点击不等于转化/留存/因果”的护栏。
6. 只返回 JSON，不要 Markdown、代码或解释。

JSON 格式：
{"summary":"本次归纳摘要","principles":[{"category":"首屏承接","severity":"P0","title":"原则标题","principle":"可迁移原则","evidence":"案例依据","action":"执行动作","validation":"验证方式","guardrail":"护栏","tags":["CTA","漏斗"]}]}

来源类型：${designText(source.sourceType, '运营案例')}
来源标题：${designText(source.title, '未命名资料')}
资料正文：
${designText(source.sourceText, '资料正文为空，请基于现有知识谨慎归纳。')}

当前知识库已有原则（用于避免重复，可提出更好的补充）：
${JSON.stringify(existingKnowledge || [])}`;
}

function promptForHtmlDesign(evidence: unknown, prompt: unknown, feedback: unknown) {
  const record = asRecord(evidence); const behavior = asRecord(record.behavior); const elements = Array.isArray(behavior.elements) ? behavior.elements.map(asRecord) : [];
  const topElements = elements.slice(0, 12).map((item, index) => `${index + 1}. ${designText(item.name, '未命名元素')}：${Number(item.clicks) || 0} 次点击，占 ${Number(item.share) || 0}%；类型 ${designText(item.kind, '未知')}；模块 ${designText(item.module, '未提供')}`).join('\n');
  return `你是资深前端设计师。请直接为当前真实页面生成一份可运行的纯前端 HTML 文件，不要输出 JSON、Markdown、代码围栏或解释文字。页面内容必须基于输入的 URL、热力图视觉信息、点击数据和这句改版要求，不得套用固定模板或伪造通用模块。

改版要求：${designText(prompt, '请根据页面热力与点击分布重新组织信息层级和行动路径。')}

页面 URL：${designText(record.url)}
页面目标：${designText(record.goal)}
核心 CTA：${designText(record.primaryCta)}
设备类型：${designText(record.device)}；受众：${designText(record.audience)}
品牌主色：${designText(record.brandColor).toUpperCase()}；品牌调性：${designText(record.brandTone)}
点击总量：${Number(behavior.clicks) || 0}；PV：${Number(behavior.pagePv) || '未提供'}；UV：${Number(behavior.pageUv) || '未提供'}；数据范围：${designText(behavior.range, '待确认')}
点击排名：
${topElements || '未提供元素级点击数据。'}

上一步模型分析（仅作为参考，不要复制固定布局）：
${JSON.stringify(feedback || {})}

输出要求：
1. 返回完整 <!doctype html>，包含 head、响应式 CSS 和 body，可直接放入 iframe 的 srcDoc 运行。
2. 所有页面文案、模块顺序、主 CTA 和视觉重心都要响应当前页面与点击排名；只使用 CSS/HTML，不依赖外部 CDN、图片或脚本。
3. 不得把点击次数描述为转化率、留存率或因果提升；没有数据的地方写“需补充数据”。
4. 对热图热区对应的高兴趣内容增加就近行动承接，对非核心高点击入口降低竞争性；针对 2B 页面保持克制、专业、高信息密度。
5. 页面要完整可展示，不要使用省略号、占位符或“此处放内容”。`;
}

function promptForDesign(evidence: unknown, local: unknown, feedback: unknown) {
  return `你是资深前端产品设计师和增长页面设计师。基于同一份证据包、页面 URL、热力图和上一步分析反馈，为这个具体页面生成一版全新的前端页面设计。不要套用固定模板，不要复述上一页结构，不要输出源代码。你必须根据这个 URL 和行为数据，生成一版新的、可直接交给前端实现的页面结构。\n\n硬性要求：\n1. 这是“页面设计”阶段，不是分析阶段。\n2. 页面必须针对当前 URL 的页面语义和点击热点生成，不要写死成通用模板。\n3. 设计必须包含主题色、hero、若干可渲染 section、桌面/移动布局、事件合同。\n4. section 类型应当因页面而异，可使用 metrics / cards / split / timeline / faq / cta / proof / copy；顺序和组合必须根据证据变化。\n5. 主题颜色和视觉语气要从页面基线、热力图和业务目标里推导，不要输出空话。\n6. 只返回 JSON，不要 Markdown。\n\nJSON 格式：\n{"summary":"...","design":{"pageName":"...","strategy":"...","audience":"...","theme":{"background":"#...","surface":"#...","surfaceAlt":"#...","accent":"#...","accentSoft":"#...","text":"#...","muted":"#...","border":"#...","radius":"16px","motion":"cubic-bezier(...)","tone":"..."},"hero":{"eyebrow":"...","title":"...","description":"...","primaryCta":"...","secondaryCta":"...","supportingPoints":["...","...","..."]},"sections":[{"kind":"metrics","title":"...","description":"...","items":[{"label":"...","value":"...","note":"..."}]},{"kind":"cards","title":"...","description":"...","layout":"grid","items":[{"title":"...","body":"...","note":"...","cta":"..."}]},{"kind":"split","title":"...","description":"...","leftTitle":"...","leftBody":"...","rightTitle":"...","rightItems":["..."]},{"kind":"timeline","title":"...","description":"...","steps":[{"title":"...","body":"..."}]},{"kind":"faq","title":"...","description":"...","items":[{"question":"...","answer":"..."}]},{"kind":"cta","title":"...","description":"...","primaryCta":"...","secondaryCta":"..."}],"desktop":"...","mobile":"...","events":[{"event":"...","properties":"...","purpose":"..."}],"notes":["...","..."]}}\n\n证据包：\n${JSON.stringify(evidence)}\n\n本地规则结果：\n${JSON.stringify(local)}\n\n模型分析反馈：\n${JSON.stringify(feedback)}`;
}

const DESIGN_SYSTEM_PROMPT = `你是一名资深增长设计师与转化优化专家，擅长把热力图、点击流和漏斗翻译为可执行、可追溯、可直接渲染的 UI 改版方案。输出将被程序解析，因此结构正确性优先于文采。

工作原则：每一条改动必须引用 diagnosis.id；无数据支撑的改动 severity 必须为“启发式建议”；未提供的数据不得臆造；保留品牌资产与用户认知；render.code 必须是完整可渲染 HTML 与内联 CSS，禁止散文和占位符。

受众规则：2B 使用克制专业、信任前置和高信息密度；2C 使用单一 CTA、社会证明和直给利益；2G 使用权威规整、无障碍和完整流程。只启用与 user 中受众匹配的一支。

转化规则：首屏黄金区必须放核心价值主张和 primary_cta；模块按对 page_goal 的贡献排序；冷区下沉或合并；热区但非转化元素降权；桌面端使用 F/Z 扫视，移动端使用单列和拇指可达；所有主色和强调色只从 brand_color 派生，告警与成功语义色除外。

只返回以下 JSON，不得返回 Markdown、解释或代码围栏：
{"diagnosis":[{"id":"D1","evidence":"具体事实","problem":"问题","severity":"high | mid | low | 启发式建议"}],"strategy":{"goal":"页面目标","audience":"2B | 2C | 2G","priority_order":["模块名"]},"changes":[{"module":"模块名","before":"现状","after":"改法","rationale":"原因","evidence_ref":["D1"],"priority":1}],"visual_spec":{"primary":"品牌色派生阶","type_scale":"字号字重","spacing":"间距规则","audience_notes":"受众启发式"},"render":{"format":"html","code":"完整可渲染 HTML 与内联 CSS；用 HTML 注释标出 evidence_ref"}}

输出前自检：每个 change 的 evidence_ref 非空且存在于 diagnosis；无证据项已降级；render.code 明确体现主 CTA 强化和模块重排；没有编造指标；主色未越界。`;

function promptForGrowthDesign(evidence: unknown, local: unknown, feedback: unknown) {
  const record = asRecord(evidence); const behavior = asRecord(record.behavior); const elements = Array.isArray(behavior.elements) ? behavior.elements.map(asRecord) : [];
  const topElements = elements.slice(0, 12).map((item, index) => `${index + 1}. ${designText(item.name, '未命名元素')}：${Number(item.clicks) || 0} 次点击，占 ${Number(item.share) || 0}%；类型 ${designText(item.kind, '未知')}；模块 ${designText(item.module, '未提供')}`).join('\n');
  const markedIds = Array.isArray(record.markedCtaIds) ? record.markedCtaIds.map(String) : [];
  const marked = elements.filter((item) => markedIds.includes(designText(item.id))).map((item) => designText(item.name)).filter(Boolean).join('、') || '未标记';
  const heatmapSummary = record.heatmapName ? `1. 已提供热力图截图“${designText(record.heatmapName)}”，请结合随请求附带的视觉图像识别热区、冷区与死区；无法确定的位置必须写“需补充数据”。\n2. 点击表排名靠前的元素为：${elements.slice(0, 5).map((item) => designText(item.name)).join('、')}。\n3. 当前人工确认的核心 CTA：${marked}。` : '未提供热力图截图，不得臆造空间热区。';
  const clickSummary = `总记录点击：${Number(behavior.clicks) || 0}；页面 PV：${Number(behavior.pagePv) || '未提供'}；页面 UV：${Number(behavior.pageUv) || '未提供'}；数据范围：${designText(behavior.range, '待确认')}。\n${topElements}`;
  return `【本次任务】
页面 URL：${designText(record.url)}
页面目标：${designText(record.goal)}
核心 CTA：${designText(record.primaryCta)}
设备类型：${designText(record.device)}
受众类型：${designText(record.audience)}
品牌主色：${designText(record.brandColor).toUpperCase()}　品牌调性：${designText(record.brandTone)}
业务背景：${designText(record.notes, '无')}

【注入证据 · 热力图】
${heatmapSummary}

【注入证据 · 点击流/漏斗】
${clickSummary}

【本地规则诊断】
${JSON.stringify(local)}

【上一阶段模型反馈】
${JSON.stringify(feedback)}

请严格按 system schema 输出。render.format 必须为 html，render.code 必须是完整可渲染页面，禁止模板占位符、省略号和固定通用模块；页面内容、模块顺序、文案与视觉层级必须直接响应上述 URL、热力图视觉证据和点击排名。`;
}

async function runModel(mode: Mode, model: Model, evidence: unknown, local: unknown, feedback?: unknown, promptText?: unknown, knowledgeInput?: unknown, knowledge?: unknown[]) {
  const started = Date.now();
  try {
    if (!model.apiKey || !model.model || !model.name) throw new Error('模型名称、模型 ID 和 API Key 均为必填。');
    const endpoint = await assertPublicEndpoint(model.baseUrl);
    const rawEvidence = asRecord(evidence);
    const imageUrl = typeof rawEvidence.heatmapDataUrl === 'string' && rawEvidence.heatmapDataUrl.startsWith('data:image/') ? rawEvidence.heatmapDataUrl : undefined;
    const { heatmapDataUrl: _image, ...promptEvidence } = rawEvidence;
    const prompt = mode === 'design' ? promptForGrowthDesign(promptEvidence, local, feedback) : mode === 'html' ? promptForHtmlDesign(promptEvidence, promptText, feedback) : mode === 'knowledge' ? promptForKnowledge(knowledgeInput, feedback) : promptForAnalysis(promptEvidence, local, knowledge);
    const systemPrompt = mode === 'design' ? DESIGN_SYSTEM_PROMPT : mode === 'html' ? '你只输出完整可运行的纯前端 HTML，不输出 JSON、Markdown 或解释。' : mode === 'knowledge' ? '你只输出符合知识库 JSON schema 的运营方法论。' : '你只输出符合要求的分析 JSON。';
    const request = buildProviderRequest(model, { systemPrompt, prompt, imageUrl, maxTokens: mode === 'html' ? 12000 : mode === 'design' ? 8000 : 5000, temperature: 0.2, jsonOutput: mode !== 'html' });
    const timeoutSeconds = Math.min(300, Math.max(30, Number(model.timeoutSeconds) || 180));
    const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal: AbortSignal.timeout(timeoutSeconds * 1000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const payloadRecord = asRecord(payload);
      const providerPayload = asRecord(payloadRecord.error);
      const raw = asString(providerPayload.message || payloadRecord.message || JSON.stringify(payload) || `供应商返回 HTTP ${response.status}`, 2048);
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      return { modelId: model.id, modelName: model.name, status: 'failed' as const, latencyMs: Date.now() - started, error: normalizeProviderError(model, { message: raw, raw, code: asString(providerPayload.code || providerPayload.type, 120), httpStatus: response.status, retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : undefined }) };
    }
    const text = extractProviderText(payload, model.protocol);
    if (mode === 'html') {
      const brandColor = designText(promptEvidence.brandColor, '#0A9C8A');
      const output = parseHtmlOutput(text, brandColor);
      if (!output) {
        return { modelId: model.id, modelName: model.name, status: 'failed' as const, latencyMs: Date.now() - started, error: normalizeProviderError(model, { reason: 'INVALID_HTML', message: htmlValidationMessage(text) || '模型未返回可渲染的 HTML 文件。', raw: text }) };
      }
      return { modelId: model.id, modelName: model.name, status: 'success' as const, latencyMs: Date.now() - started, output };
    }
    return mode === 'design'
      ? { modelId: model.id, modelName: model.name, status: 'success' as const, latencyMs: Date.now() - started, output: parseDesignOutput(text, promptEvidence) }
      : mode === 'knowledge'
        ? { modelId: model.id, modelName: model.name, status: 'success' as const, latencyMs: Date.now() - started, output: parseKnowledgeOutput(text) }
        : { modelId: model.id, modelName: model.name, status: 'success' as const, latencyMs: Date.now() - started, output: parseAnalysisOutput(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型调用失败。';
    const timeout = /timeout|aborted/i.test(message);
    const seconds = Math.min(300, Math.max(30, Number(model.timeoutSeconds) || 180));
    const providerError = normalizeProviderError(model, { message: timeout ? `模型在 ${seconds} 秒内未返回。` : message, raw: message, reason: timeout ? 'TIMEOUT' : undefined });
    return { modelId: model.id, modelName: model.name, status: 'failed' as const, latencyMs: Date.now() - started, error: providerError };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: Mode; evidence?: unknown; local?: unknown; feedback?: unknown; prompt?: unknown; models?: unknown; knowledgeInput?: unknown; knowledge?: unknown[] };
    const mode = body.mode === 'design' ? 'design' : body.mode === 'html' ? 'html' : body.mode === 'knowledge' ? 'knowledge' : 'analysis';
    if ((mode !== 'knowledge' && !body.evidence) || (mode === 'design' && !body.local) || !Array.isArray(body.models)) return NextResponse.json({ error: '缺少分析证据或模型配置。' }, { status: 400 });
    const models = body.models.slice(0, 4).map((item) => {
      const model = item as Model;
      return { ...model, protocol: isProviderProtocol(model.protocol) ? model.protocol : 'responses' };
    }).filter((item) => item && typeof item.baseUrl === 'string');
    if (!models.length) return NextResponse.json({ error: '请至少配置一个可用模型。' }, { status: 400 });
    const results = await Promise.all(models.map((model) => runModel(mode, model, body.evidence || {}, body.local, body.feedback, body.prompt, body.knowledgeInput, body.knowledge)));
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: '无法读取分析请求。' }, { status: 400 }); }
}
