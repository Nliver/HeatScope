import { promises as dns } from 'node:dns';
import net from 'node:net';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 70;

type Model = {
  name?: string;
  baseUrl?: string;
  model?: string;
  protocol?: 'responses' | 'chat_completions';
  apiKey?: string;
  reasoningEffort?: string;
  timeoutSeconds?: number;
};

const privateIPv4 = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
function privateIPv6(ip: string) { const value = ip.toLowerCase(); return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'); }
function redactSecrets(value: string) { return value.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***'); }
function messageOf(value: unknown, fallback: string) { return typeof value === 'string' && value ? redactSecrets(value.slice(0, 500)) : fallback; }

async function assertPublicEndpoint(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('模型地址不是有效 URL。'); }
  if (url.protocol !== 'https:') throw new Error('模型地址必须使用 HTTPS。');
  if (url.username || url.password || (url.port && !['443', ''].includes(url.port))) throw new Error('模型地址不能包含凭据或非标准端口。');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('模型地址不能指向本机或内部域名。');
  if (net.isIP(host)) { if (privateIPv4(host) || privateIPv6(host)) throw new Error('模型地址不能指向私有网络。'); return url; }
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => privateIPv4(item.address) || privateIPv6(item.address))) throw new Error('模型地址解析到了私有网络，已拒绝请求。');
  return url;
}

function apiRoot(url: URL) { const base = url.toString().replace(/\/$/, ''); return /\/v\d+$/i.test(url.pathname) ? base : `${base}/v1`; }

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const { model } = await request.json() as { model?: Model };
    if (!model?.baseUrl || !model.model || !model.apiKey || !model.protocol) throw new Error('请填写模型名称、Base URL、模型 ID、协议和 API Key。');
    const endpoint = await assertPublicEndpoint(model.baseUrl);
    const root = apiRoot(endpoint);
    const body = model.protocol === 'responses'
      ? { model: model.model, input: '请只返回 OK。', reasoning: model.reasoningEffort ? { effort: model.reasoningEffort } : undefined, max_output_tokens: 64 }
      : { model: model.model, messages: [{ role: 'user', content: '请只返回 OK。' }], max_tokens: 64, temperature: 0 };
    const path = model.protocol === 'responses' ? '/responses' : '/chat/completions';
    const timeoutSeconds = Math.min(60, Math.max(15, Number(model.timeoutSeconds) || 30));
    const response = await fetch(`${root}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${model.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageOf((payload as { error?: { message?: unknown } })?.error?.message, `供应商返回 HTTP ${response.status}`));
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const raw = redactSecrets(error instanceof Error ? error.message : '连接检测失败。');
    const timeout = /timeout|aborted/i.test(raw);
    return NextResponse.json({ ok: false, error: timeout ? '连接检测在 60 秒内未完成。请检查模型推理强度、网络或服务商状态。' : raw }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
}
