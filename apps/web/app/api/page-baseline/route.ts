import { promises as dns } from 'node:dns';
import net from 'node:net';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const privateIPv4 = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
function privateIPv6(ip: string) { const value = ip.toLowerCase(); return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'); }

async function assertPublicPage(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('页面地址不是有效 URL。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持抓取 http 或 https 页面。');
  if (url.username || url.password) throw new Error('页面地址不能包含凭据。');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('页面地址不能指向本机或内部域名。');
  if (net.isIP(host)) { if (privateIPv4(host) || privateIPv6(host)) throw new Error('页面地址不能指向私有网络。'); return url; }
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => privateIPv4(item.address) || privateIPv6(item.address))) throw new Error('页面地址解析到了私有网络，已拒绝抓取。');
  return url;
}

function cleanup(text: string) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? cleanup(match[1]) : '';
}

function rawMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] || '';
}

function allMatches(html: string, pattern: RegExp, limit = 8) {
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = cleanup(match[1] || '');
    if (!text || text.length > 32 || values.includes(text)) continue;
    values.push(text);
    if (values.length >= limit) break;
  }
  return values;
}

function titleParts(title: string, host: string) {
  const parts = title.split(/[-|·]/).map((item) => item.trim()).filter(Boolean);
  return {
    siteName: parts.length > 1 ? parts[parts.length - 1] : host.replace(/^www\./, ''),
    pageTitle: parts.length ? parts[0] : host.replace(/^www\./, ''),
  };
}

function toneOf(themeColor?: string) {
  if (!themeColor || !/^#?[0-9a-f]{6}$/i.test(themeColor)) return 'slate' as const;
  const hex = themeColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (r > g && r > b) return 'warm' as const;
  if (g >= b) return 'teal' as const;
  return 'slate' as const;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    if (!body.url) return NextResponse.json({ error: '缺少页面 URL。' }, { status: 400 });
    const target = await assertPublicPage(body.url);
    const response = await fetch(target, {
      headers: {
        'User-Agent': 'HeatScope/1.0 (+page-baseline)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return NextResponse.json({ error: `页面返回 HTTP ${response.status}。` }, { status: 422 });
    const html = (await response.text()).slice(0, 800000);

    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageDescription = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const siteNameMeta = firstMatch(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    const h1 = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const themeColor = firstMatch(html, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
    const navBlock = rawMatch(html, /<nav[\s\S]*?>([\s\S]*?)<\/nav>/i) || rawMatch(html, /<header[\s\S]*?>([\s\S]*?)<\/header>/i);
    const navItems = allMatches(navBlock || html, /<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi, 6);
    const sections = allMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 8);
    const primaryCtas = allMatches(html, /<(?:a|button)[^>]*>([\s\S]*?(?:注册|试用|体验|购买|咨询|开始|领取|开通|API Key)[\s\S]*?)<\/(?:a|button)>/gi, 6);
    const fallback = titleParts(title || h1 || target.hostname, target.hostname);

    return NextResponse.json({
      baseline: {
        siteName: siteNameMeta || fallback.siteName,
        host: target.hostname,
        pageTitle: fallback.pageTitle,
        heroTitle: h1 || fallback.pageTitle,
        description: pageDescription || undefined,
        navItems,
        primaryCtas,
        sections,
        themeColor: themeColor || undefined,
        tone: toneOf(themeColor),
        source: 'fetched',
        fetchedAt: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '页面结构抓取失败。';
    const timeout = /timeout|aborted/i.test(message);
    return NextResponse.json({ error: timeout ? '页面结构抓取在 15 秒内未完成。请稍后重试，或直接上传热力图与数据分析。' : message }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
}
