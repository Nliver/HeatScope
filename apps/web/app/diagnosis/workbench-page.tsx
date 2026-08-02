'use client';

import { Check, CheckmarkFilled, CircleAlert, CircleCheck, CircleDashed, Clock3, Crosshair, Download, FileSpreadsheet, ImagePlus, KeyRound, Layers3, ListFilter, LoaderCircle, LockKeyhole, MousePointer2, Pencil, Plus, Save, Settings2, SlidersHorizontal, Sparkles, Square, Wifi, X, ZoomIn, ZoomOut } from '../icons';
import * as Dialog from '@radix-ui/react-dialog';
import { usePathname, useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { parseBehaviorFile, type ElementRecord, type ImportedClicks } from '../../lib/csv';
import { formatProviderError, runLocalAnalysis, runModelAnalysis, runModelHtmlDesign, runModelPageDesign, testModelConnection, type Audience, type Blueprint, type Evidence, type GeneratedPageDesign, type Goal, type HtmlDesignResult, type Insight, type LocalAnalysis, type ModelAnalysisProgress, type ModelConfig, type ModelResult, type PageArchetype, type PageBaseline, type PageDesignSection, type ProviderError } from '../../lib/api';
import { isFrozenHistoryRecord, isHistoryQuotaError, readHistoryRecords, withDiagnosisChecksum, writeHistoryRecords, WORKSPACE_STORAGE_KEY, type EvidenceRef, type HistoryRecord, type HistoryStatus } from '../../lib/history';
import { ConsoleFooter, ConsoleSidebar, ConsoleTopbar, consoleRouteByView, consoleViewFromPathname, type ConsoleView } from '../console-shell';
import { neutralizePreviewHtml } from '../../lib/html-preview';
import KnowledgeView from '../knowledge-view';
import { readKnowledgeLibrary } from '../../lib/knowledge';
import { InfoHint, TextDisclosure } from '../ui-text';
import { isProviderProtocol, protocolLabel } from '../../lib/model-protocol';

const number = new Intl.NumberFormat('zh-CN');
const goals: Goal[] = ['注册/试用', '购买/询价', '内容消费', '活动领取', '自定义关键动作'];
const archetypeLabel: Record<PageArchetype, string> = { product: '产品能力页', campaign: '活动落地页', pricing: '套餐方案页', content: '内容承接页', generic: '通用官网页' };
const railTitle: Record<PageArchetype, string> = { product: '建议首屏结构', campaign: '活动承接结构', pricing: '方案决策结构', content: '内容转化结构', generic: '推荐页面结构' };
const railPoints: Record<PageArchetype, string[]> = {
  product: ['价值一句话 + 主 CTA', '场景入口与能力预览', '3 步上手路径'],
  campaign: ['权益与资格并列展示', '按人群拆分入口', '规则后就近领取'],
  pricing: ['先匹配需求再看套餐', '对比列高亮推荐项', 'FAQ 后直接咨询/购买'],
  content: ['摘要先讲收获', '高兴趣内容后给资源', '页末分流到实践动作'],
  generic: ['唯一主路径', '高兴趣区就近承接', '风险信息前置解释'],
};
const demoEntries = [
  { id: 'agent', name: 'AI Agent 页', goal: '注册/试用', summary: '演示产品能力页如何围绕体验与激活动作做承接。', heatmap: 'Agent 热力图' },
  { id: 'plan', name: 'AI 订阅页', goal: '购买/询价', summary: '演示套餐页如何围绕模型选择与方案决策做改版。', heatmap: '订阅页热力图' },
  { id: 'activity', name: '春季活动页', goal: '活动领取', summary: '演示活动聚合页如何做分流、权益表达和 CTA 归因。', heatmap: '活动页热力图' },
] as const;

function errorMessage(error: unknown) { return formatProviderError(error, '操作失败，请稍后重试。'); }
function providerErrorMessage(error: ProviderError | string | undefined) { return formatProviderError(error); }
function providerErrorRaw(error: ProviderError | string | undefined) { return typeof error === 'string' ? error : error?.raw; }
function providerErrorRetryable(error: ProviderError | string | undefined) { return typeof error === 'object' && error ? error.retryable : true; }
function providerErrorMeta(error: ProviderError | string | undefined) {
  if (!error || typeof error === 'string') return '';
  return [error.provider, error.reason, error.code, error.httpStatus ? `HTTP ${error.httpStatus}` : ''].filter(Boolean).join(' · ');
}
function clientProviderError(model: ModelConfig, reason: unknown): ProviderError {
  const timeout = reason instanceof Error && (reason.name === 'TimeoutError' || /timeout|timed out|超过 .* 秒未返回/i.test(reason.message));
  const message = timeout ? `模型在 ${model.timeoutSeconds} 秒内未返回 HTML，请重新测试该模型。` : errorMessage(reason);
  return { provider: model.name || '模型服务商', reason: timeout ? 'TIMEOUT' : 'UNKNOWN', message, raw: message, retryable: true, occurredAt: new Date().toISOString() };
}
function htmlJobStatus(result: HtmlDesignResult): HtmlGenerationJob['status'] {
  if (result.status === 'success' && result.output?.html) return 'success';
  if (typeof result.error === 'object' && result.error?.reason === 'TIMEOUT') return 'timeout';
  return 'failed';
}
function safeDesignText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  const parts = [record.title, record.body, record.note, record.description, record.text]
    .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.join(' · ') || fallback;
}
function safeDesignTextArray(value: unknown): string[] { return Array.isArray(value) ? value.map((item) => safeDesignText(item)).filter(Boolean) : []; }
function safeId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
async function compactHeatmapForModel(file: File): Promise<string | undefined> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const target = new Image(); target.onload = () => resolve(target); target.onerror = reject; target.src = source; });
    const scale = Math.min(1, 1440 / image.naturalWidth); const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    return dataUrl.length <= 2_500_000 ? dataUrl : undefined;
  } finally { URL.revokeObjectURL(source); }
}
async function compactHeatmapForPreview(file: File): Promise<string> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const target = new Image(); target.onload = () => resolve(target); target.onerror = reject; target.src = source; });
    const scale = Math.min(1, 1200 / image.naturalWidth); const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.62);
  } finally { URL.revokeObjectURL(source); }
}
function download(name: string, contents: string, type = 'text/markdown;charset=utf-8') { const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function topHotspots(evidence: Evidence) { return evidence.behavior.elements.filter((item) => item.kind !== '导航').slice(0, 4); }
function ctaShare(evidence: Evidence) {
  const ctaIds = new Set(evidence.markedCtaIds);
  const targets = evidence.behavior.elements.filter((item) => ctaIds.has(item.id));
  const clicks = targets.reduce((sum, item) => sum + item.clicks, 0);
  return evidence.behavior.clicks ? Number((clicks / evidence.behavior.clicks * 100).toFixed(1)) : 0;
}

const WORKSPACE_SAFE_LIMIT = 3_800_000;
const WORKSPACE_HEATMAP_CACHE_KEY = `${WORKSPACE_STORAGE_KEY}:heatmap-preview`;
const DEFAULT_UI_PROMPT = '请按该页面的营销转化数据主次以及用户基础习惯重新调整页面结构和各模块内容，同时充分考虑 2B 用户审美习惯和当前品牌主色调，对页面 UI 进行升级。';
const wizardStepIds = ['input', 'analysis', 'output', 'review'] as const;
type WizardStepIndex = 0 | 1 | 2 | 3;
type HtmlGenerationJob = { jobId: string; modelId: string; modelName: string; status: 'queued' | 'running' | 'streaming' | 'success' | 'failed' | 'timeout' | 'cancelled'; attempts: number; error?: ProviderError | string; html?: string; startedAt?: string; finishedAt?: string };
type PromptCompositionInput = { instruction: string; selectedModels: ModelConfig[]; includeVisual: boolean; coordinates: string[]; localHits: Insight[]; evidence?: Evidence };

function composeUiPrompt({ instruction, selectedModels, includeVisual, coordinates, localHits, evidence }: PromptCompositionInput) {
  const modelNames = selectedModels.map((model) => model.name).join('、') || '尚未选择生成模型';
  const coordinateText = coordinates.length ? coordinates.join('；') : '尚未标注热力图坐标';
  const hardConstraints = localHits.length ? localHits.map((item) => `${item.priority} ${item.title}：${item.action}`).join('\n- ') : '本地规则尚未完成';
  return `【页面改版任务】
${instruction.trim() || DEFAULT_UI_PROMPT}

【页面上下文】
- URL：${evidence?.url || '待补充'}
- 页面目标：${evidence?.goal || '待补充'}
- 核心 CTA：${evidence?.primaryCta || '待补充'}
- 受众：${evidence?.audience || '待补充'}；品牌主色：${evidence?.brandColor || '待补充'}；品牌调性：${evidence?.brandTone || '待补充'}

【动态路由状态】
- 生成模型：${modelNames}
- 热力图视觉输入：${includeVisual ? '开启，随请求发送截图' : '关闭，仅使用点击数据与坐标'}
- 已确认坐标：${coordinateText}

【本地规则硬约束】
- ${hardConstraints}

【输出合同】
只返回完整、响应式、可直接运行的纯前端 HTML。页面结构、文案、CTA 和视觉层级必须响应以上证据；不得把点击次数表述为转化率、留存率或因果提升。`;
}

type PersistedWorkspace = {
  draftId?: string;
  comparisonBaseline?: { recordId: string; name: string; snapshotAt: string; diagnosisChecksum: string };
  url: string;
  goal: Goal;
  device: string;
  audience: Audience;
  brandColor: string;
  brandTone: string;
  primaryCta: string;
  notes: string;
  pageBaseline?: PageBaseline;
  behavior?: ImportedClicks;
  heatmapName: string;
  heatmapDataUrl: string;
  heatmapPreviewUrl?: string;
  includeHeatmapInModel: boolean;
  markedCtas: string[];
  models: ModelConfig[];
  local?: LocalAnalysis;
  results: ModelResult[];
  selectedModelId: string;
  selectedPageDesign?: GeneratedPageDesign;
  uiPrompt?: string;
  htmlDesigns?: HtmlDesignResult[];
  selectedHtmlModelIds?: string[];
  activeHtmlModelId?: string;
  htmlJobs?: HtmlGenerationJob[];
  heatmapCoordinates?: Record<string, string>;
  currentStep?: WizardStepIndex;
  afterBehavior?: ImportedClicks;
  evidenceConfirmed?: boolean;
};

type WorkspacePanel = 'overview' | 'input' | 'analysis' | 'output' | 'review';
type HistorySnapshotOverrides = {
  localOutput?: LocalAnalysis;
  modelOutputs?: ModelResult[];
  pageDesign?: GeneratedPageDesign;
  htmlDesigns?: HtmlDesignResult[];
  activeHtmlModelId?: string;
  stage?: 1 | 2 | 3 | 4;
};

function ModelConfigView({ models, onOpen }: { models: ModelConfig[]; onOpen(): void }) {
  return <div className="console-page"><div className="console-page-head"><div><span>模型配置</span><h1>选择你的分析引擎</h1></div><button type="button" className="console-button primary" onClick={onOpen}><Plus size={15} /> 添加模型</button></div><div className="model-config-panel"><div className="model-config-head"><div><h2>已配置服务</h2></div><span>{models.filter((item) => item.connectionStatus === 'success').length} 个已连接</span></div><div className="model-config-list">{models.map((model) => <article key={model.id}><div className="model-config-name"><span className={`model-dot ${model.connectionStatus || 'untested'}`} /><div><b>{model.name}</b><small>{model.model} · {protocolLabel(model.protocol)}</small></div></div><div className="model-config-meta"><span className={`model-state ${model.connectionStatus || 'untested'}`}>{model.connectionStatus === 'success' ? '已连接' : model.connectionStatus === 'failed' ? '连接失败' : model.connectionStatus === 'testing' ? '检测中' : '未检测'}</span><span>{model.enabled ? '启用中' : '已停用'}</span></div></article>)}<article className="model-config-local"><div><b>本地规则</b><small>确定性规则引擎 · 始终执行</small></div><span className="model-state success">可用</span></article>{models.length === 0 && <div className="model-config-empty"><KeyRound size={19} /><b>尚未添加模型服务</b></div>}</div><div className="model-config-foot"><button type="button" className="console-button" onClick={onOpen}>管理模型配置</button></div></div></div>;
}

function readWorkspace(): PersistedWorkspace | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    return undefined;
  }
}

function readHeatmapPreviewCache() {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(WORKSPACE_HEATMAP_CACHE_KEY) || ''; } catch { return ''; }
}

function safeWriteWorkspace(workspace: PersistedWorkspace) {
  if (typeof window === 'undefined') return;
  const write = (value: PersistedWorkspace) => window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(value));
  try {
    if (workspace.heatmapPreviewUrl) window.localStorage.setItem(WORKSPACE_HEATMAP_CACHE_KEY, workspace.heatmapPreviewUrl);
    else window.localStorage.removeItem(WORKSPACE_HEATMAP_CACHE_KEY);
  } catch { /* workspace persistence remains best effort */ }
  try {
    const payload = JSON.stringify(workspace);
    if (payload.length <= WORKSPACE_SAFE_LIMIT) { write(workspace); return; }
    write({ ...workspace, behavior: undefined, afterBehavior: undefined, heatmapDataUrl: '', heatmapPreviewUrl: '' });
  } catch {
    try { write({ ...workspace, behavior: undefined, afterBehavior: undefined, heatmapDataUrl: '', heatmapPreviewUrl: '', results: workspace.results.slice(0, 4) }); } catch { /* ignore */ }
  }
}

function insightMarkdown(insights: Insight[]) { return insights.map((item) => `### ${item.priority} ${item.title}\n- 证据：${item.evidence.join('；')}\n- 判断：${item.interpretation}\n- 建议：${item.action}\n- 验证：${item.validation}\n- 护栏：${item.guardrail}`).join('\n\n'); }

function resultMarkdown(evidence: Evidence, local: LocalAnalysis, design: GeneratedPageDesign, modelResults: ModelResult[]) {
  const sections = design.sections.map((section, index) => {
    if (section.kind === 'metrics') return `${index + 1}. ${section.title}（指标）\n   - ${section.items.map((item) => `${item.label}: ${item.value}${item.note ? `，${item.note}` : ''}`).join('；')}`;
    if (section.kind === 'cards') return `${index + 1}. ${section.title}（卡片）\n   - ${section.items.map((item) => `${item.title}：${item.body}`).join('；')}`;
    if (section.kind === 'split') return `${index + 1}. ${section.title}（分栏）\n   - 左：${section.leftTitle} / ${section.leftBody}\n   - 右：${section.rightTitle} / ${section.rightItems.join('；')}`;
    if (section.kind === 'timeline') return `${index + 1}. ${section.title}（路径）\n   - ${section.steps.map((step) => `${step.title}：${step.body}`).join('；')}`;
    if (section.kind === 'faq') return `${index + 1}. ${section.title}（FAQ）\n   - ${section.items.map((item) => `${item.question}：${item.answer}`).join('；')}`;
    if (section.kind === 'cta') return `${index + 1}. ${section.title}（CTA）\n   - ${section.description} / ${section.primaryCta} / ${section.secondaryCta}`;
    if (section.kind === 'copy') return `${index + 1}. ${section.title}（文案）\n   - ${section.body}`;
    return `${index + 1}. ${section.title}（证明）\n   - ${section.items.map((item) => safeDesignText(item)).join('；')}`;
  }).join('\n\n');
  return `# 页面增长诊断实施包\n\n## 页面与数据范围\n- URL：${evidence.url}\n- 目标：${evidence.goal}\n- 设备：${evidence.device}\n- 数据时间：${evidence.behavior.range}\n- 数据层级：${local.dataLevel}\n- 证据指纹：${local.evidenceHash}\n\n> 点击数据仅支持点击观察；缺少结果事件或实验时，不能将结论表述为转化、留存或因果提升。\n\n## 本地规则诊断\n${insightMarkdown(local.insights)}\n\n## 模型生成页面\n- 页面名称：${design.pageName}\n- 策略：${design.strategy}\n- 适配人群：${design.audience}\n- 桌面端：${design.desktop}\n- 移动端：${design.mobile}\n- 视觉主题：${design.theme.tone} / ${design.theme.accent}\n\n### Hero\n- ${design.hero.eyebrow}\n- ${design.hero.title}\n- ${design.hero.description}\n- 主 CTA：${design.hero.primaryCta}\n- 次 CTA：${design.hero.secondaryCta}\n- 支撑点：${design.hero.supportingPoints.join('；')}\n\n### Sections\n${sections}\n\n## 事件合同\n${design.events.map((event) => `- \`${event.event}\`：${event.properties}。${event.purpose}`).join('\n')}\n\n## 设计备注\n${design.notes.map((note) => `- ${note}`).join('\n')}\n\n## 模型对比\n${modelResults.map((result) => `- ${result.modelName}：${result.status === 'success' ? `成功，${result.latencyMs}ms` : `失败，${result.error}`}`).join('\n')}`;
}

function UploadField({ label, accept, onChange, onClear, fileName, description }: { label: string; accept: string; onChange(event: ChangeEvent<HTMLInputElement>): void; onClear(): void; fileName?: string; description: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className={`upload-field ${fileName ? 'has-file' : ''}`}>
    <label className="upload-picker">
      <input ref={inputRef} type="file" accept={accept} onChange={onChange} />
      <span className="upload-icon">{label.includes('热力') ? <ImagePlus size={19} /> : <FileSpreadsheet size={19} />}</span>
      <span className="upload-copy"><b>{label}</b><small>{description}</small>{fileName && <span className="upload-file-name">{fileName}</span>}</span>
    </label>
    <div className="upload-actions">
      <button type="button" className="upload-button" onClick={() => inputRef.current?.click()}>{fileName ? '更换' : '选择文件'}</button>
      {fileName && <button type="button" className="upload-remove" onClick={() => { if (inputRef.current) inputRef.current.value = ''; onClear(); }}>删除</button>}
    </div>
  </div>;
}

function InsightItem({ insight }: { insight: Insight }) {
  return <article className="insight"><header><span className={`priority ${insight.priority.toLowerCase()}`}>{insight.priority}</span><h3>{insight.title}</h3></header><div className="insight-grid"><div><b>观察依据</b><p>{insight.evidence.join('；')}</p></div><div><b>可能解释</b><p>{insight.interpretation}</p></div><div><b>建议动作</b><p>{insight.action}</p></div><div><b>验证与护栏</b><p>{insight.validation}<br /><em>{insight.guardrail}</em></p></div></div></article>;
}

function BlueprintPreview({ blueprint, evidence, local }: { blueprint: Blueprint; evidence: Evidence; local: LocalAnalysis }) {
  const baseline = evidence.pageBaseline;
  const hotspots = topHotspots(evidence);
  const navItems = baseline?.navItems.slice(0, 3).length ? baseline.navItems.slice(0, 3) : ['价值', '方案', '证据'];
  const signals = [
    { label: '页面原型', value: archetypeLabel[blueprint.archetype], note: blueprint.audience },
    { label: '主 CTA 份额', value: `${ctaShare(evidence)}%`, note: evidence.markedCtaIds.length ? '基于已标记核心 CTA' : '建议先标记核心 CTA' },
    { label: '最高兴趣区', value: hotspots[0]?.name || '待补充', note: hotspots[0] ? `${number.format(hotspots[0].clicks)} 次点击` : '暂无可用行为数据' },
    { label: '原页基线', value: baseline?.pageTitle || '未抓取', note: baseline ? `${baseline.source === 'demo' ? '演示' : '在线抓取'} · ${baseline.host}` : '可先抓取 URL 页面结构' },
  ];

  return <div className={`generated-preview preview-${blueprint.archetype} tone-${baseline?.tone || 'slate'}`} aria-label="新版页面 UI 参考预览">
    <div className="generated-browser">
      <div className="generated-browser-bar"><span /><span /><span /><b>{baseline?.siteName || new URL(evidence.url).hostname}</b></div>
      <div className="generated-page">
        <div className="generated-topbar">
          <b>{baseline?.pageTitle || 'HeatScope Preview'}</b>
          <nav>{navItems.map((item) => <span key={item}>{item}</span>)}<button>{blueprint.hero.primaryCta}</button></nav>
        </div>
        <section className="generated-hero">
          <div className="hero-copy">
            <small>{blueprint.hero.eyebrow}</small>
            <h3>{blueprint.hero.title}</h3>
            <p>{blueprint.hero.description}</p>
            <div className="hero-actions"><button>{blueprint.hero.primaryCta}</button><button className="preview-secondary">{blueprint.hero.secondaryCta}</button></div>
            <div className="hero-tags">
              {hotspots.slice(0, 3).map((item) => <span key={item.id}>{item.name}</span>)}
            </div>
          </div>
          <aside className="hero-rail">
            <b>{railTitle[blueprint.archetype]}</b>
            {railPoints[blueprint.archetype].map((item) => <span key={item}>{item}</span>)}
          </aside>
        </section>

        <section className="preview-signal-strip">
          {signals.map((signal) => <article key={signal.label}><span>{signal.label}</span><b>{signal.value}</b><small>{signal.note}</small></article>)}
        </section>

        <section className="preview-story-grid">
          <article className="story-card story-lead">
            <i>01</i>
            <b>{blueprint.modules[0]?.title}</b>
            <p>{blueprint.modules[0]?.content}</p>
            <small>{blueprint.modules[0]?.interaction}</small>
          </article>
          <article className="story-card story-proof">
            <i>02</i>
            <b>生成依据</b>
            <p>{blueprint.visualDirection}</p>
            <ul>
              {(baseline?.sections.slice(0, 2) || []).map((item) => <li key={item}>原页区块：{item}</li>)}
              {local.insights.slice(0, Math.max(1, 3 - (baseline?.sections.slice(0, 2).length || 0))).map((item) => <li key={item.id}>{item.title}</li>)}
            </ul>
          </article>
          {blueprint.modules.slice(1, 4).map((module, index) => <article className="story-card" key={`${module.title}-${index}`}>
            <i>{String(index + 3).padStart(2, '0')}</i>
            <b>{module.title}</b>
            <p>{module.purpose}</p>
            <small>{module.interaction}</small>
          </article>)}
        </section>

        <section className="preview-conversion-zone">
          <div>
            <span>推荐上线结构</span>
            <h4>{blueprint.strategy}</h4>
            <p>{blueprint.desktop}</p>
          </div>
          <div className="conversion-steps">
            {blueprint.events.slice(0, 4).map((event) => <article key={event.event}><code>{event.event}</code><small>{event.purpose}</small></article>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function GenerationLogic({ evidence, blueprint, local }: { evidence: Evidence; blueprint: Blueprint; local: LocalAnalysis }) {
  const hotspots = topHotspots(evidence);
  const baseline = evidence.pageBaseline;
  return <section className="generation-logic">
    <div className="generation-copy">
      <span>适配逻辑</span>
      <h3>证据适配逻辑</h3>
      <InfoHint label="证据适配说明">这个预览会随页面类型和证据变化；系统根据 URL、页面目标、主 CTA 和高点击元素推断页面原型，再用本地规则把高兴趣区、竞争性 CTA 和决策摩擦翻译成模块顺序、首屏结构与事件合同。</InfoHint>
    </div>
    <div className="generation-grid">
      <article><b>1. 页面原型</b><p>{archetypeLabel[blueprint.archetype]}</p><small>{blueprint.audience}</small></article>
      <article><b>2. 证据输入</b><p>{evidence.behavior.sourceName} · {evidence.behavior.range}</p><small>{evidence.heatmapName ? '含热力图截图' : '当前未导入热力图'}</small></article>
      <article><b>3. 高兴趣区</b><p>{hotspots.slice(0, 2).map((item) => item.name).join(' / ') || '待补充'}</p><small>{hotspots[0] ? `${number.format(hotspots[0].clicks)} 次点击` : '暂无行为热点'}</small></article>
      <article><b>4. 生成结果</b><p>{local.insights.length} 条规则洞察 · {blueprint.modules.length} 个模块</p><small>{baseline ? `${baseline.siteName} 基线已纳入预览` : '输出桌面/移动结构、事件合同和上线复盘建议'}</small></article>
    </div>
  </section>;
}

function renderDesignSection(section: PageDesignSection, palette: GeneratedPageDesign['theme'], index: number) {
  const baseStyle = { background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: palette.radius, color: palette.text };
  const sectionTitle = safeDesignText(section.title, '未命名区块');
  if (section.kind === 'metrics') {
    return <section key={`${section.kind}-${index}`} className="design-section design-metrics" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3>{section.description && <p>{safeDesignText(section.description)}</p>}</div>
      </div>
      <div className="design-metric-grid">
        {section.items.map((item, itemIndex) => <article key={`${section.kind}-${index}-${itemIndex}`} className="design-metric" style={{ background: palette.surfaceAlt, borderColor: palette.border }}>
          <b>{safeDesignText(item.value, '-')}</b><span>{safeDesignText(item.label, '指标')}</span>{item.note && <small>{safeDesignText(item.note)}</small>}
        </article>)}
      </div>
    </section>;
  }
  if (section.kind === 'cards') {
    return <section key={`${section.kind}-${index}`} className="design-section" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3>{section.description && <p>{safeDesignText(section.description)}</p>}</div>
      </div>
      <div className={`design-card-grid design-card-grid-${section.layout || 'grid'}`}>
        {section.items.map((item, itemIndex) => <article key={`${section.kind}-${index}-${itemIndex}`} className="design-card" style={{ background: palette.surfaceAlt, borderColor: palette.border }}>
          <b>{safeDesignText(item.title, '信息卡片')}</b><p>{safeDesignText(item.body)}</p>{item.note && <small>{safeDesignText(item.note)}</small>}{item.cta && <span style={{ color: palette.accent }}>{safeDesignText(item.cta)}</span>}
        </article>)}
      </div>
    </section>;
  }
  if (section.kind === 'split') {
    return <section key={`${section.kind}-${index}`} className="design-section design-split" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3>{section.description && <p>{safeDesignText(section.description)}</p>}</div>
      </div>
      <div className="design-split-grid">
        <article className="design-copy-card" style={{ background: palette.surfaceAlt, borderColor: palette.border }}><b>{safeDesignText(section.leftTitle, '重点信息')}</b><p>{safeDesignText(section.leftBody)}</p></article>
        <article className="design-copy-card" style={{ background: palette.surfaceAlt, borderColor: palette.border }}><b>{safeDesignText(section.rightTitle, '下一步')}</b><ul>{section.rightItems.map((item, itemIndex) => <li key={`${section.kind}-${index}-${itemIndex}`}>{safeDesignText(item)}</li>)}</ul></article>
      </div>
    </section>;
  }
  if (section.kind === 'timeline') {
    return <section key={`${section.kind}-${index}`} className="design-section" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3>{section.description && <p>{safeDesignText(section.description)}</p>}</div>
      </div>
      <div className="design-timeline">
        {section.steps.map((step, stepIndex) => <article key={`${section.kind}-${index}-${stepIndex}`} style={{ background: palette.surfaceAlt, borderColor: palette.border }}>
          <i>{String(stepIndex + 1).padStart(2, '0')}</i>
          <div><b>{safeDesignText(step.title, '步骤')}</b><p>{safeDesignText(step.body)}</p></div>
        </article>)}
      </div>
    </section>;
  }
  if (section.kind === 'faq') {
    return <section key={`${section.kind}-${index}`} className="design-section" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3>{section.description && <p>{safeDesignText(section.description)}</p>}</div>
      </div>
      <div className="design-faq">
        {section.items.map((item, itemIndex) => <article key={`${section.kind}-${index}-${itemIndex}`} style={{ background: palette.surfaceAlt, borderColor: palette.border }}>
          <b>{safeDesignText(item.question, '常见问题')}</b><p>{safeDesignText(item.answer)}</p>
        </article>)}
      </div>
    </section>;
  }
  if (section.kind === 'cta') {
    return <section key={`${section.kind}-${index}`} className="design-section design-cta" style={{ ...baseStyle, background: palette.accentSoft }}>
      <div>
        <span>{String(index + 1).padStart(2, '0')}</span>
        <h3>{sectionTitle}</h3>
        <p>{safeDesignText(section.description)}</p>
      </div>
      <div className="design-cta-actions">
        <button style={{ background: palette.accent, color: palette.surface }}>{safeDesignText(section.primaryCta, '开始下一步')}</button>
        <button style={{ background: palette.surface, color: palette.text, borderColor: palette.border }}>{safeDesignText(section.secondaryCta, '了解详情')}</button>
      </div>
    </section>;
  }
  if (section.kind === 'copy') {
    return <section key={`${section.kind}-${index}`} className="design-section" style={baseStyle}>
      <div className="design-section-head">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div><h3>{sectionTitle}</h3></div>
      </div>
      <p className="design-copy-body">{safeDesignText(section.body)}</p>
    </section>;
  }
  return <section key={`${section.kind}-${index}`} className="design-section" style={baseStyle}>
    <div className="design-section-head">
      <span>{String(index + 1).padStart(2, '0')}</span>
      <div><h3>{sectionTitle}</h3></div>
    </div>
    <div className="design-proof-grid">{section.items.map((item, itemIndex) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : undefined;
      return <article key={`${section.kind}-${index}-${itemIndex}`} style={{ background: palette.surfaceAlt, borderColor: palette.border }}>
        {typeof record?.title !== 'undefined' && <b>{safeDesignText(record.title)}</b>}
        {typeof record?.body !== 'undefined' && <p>{safeDesignText(record.body)}</p>}
        {typeof record?.note !== 'undefined' && <small>{safeDesignText(record.note)}</small>}
        {!record && safeDesignText(item, '待补充证明材料')}
      </article>;
    })}</div>
  </section>;
}

function GeneratedPagePreview({ design, evidence, local }: { design: GeneratedPageDesign; evidence: Evidence; local: LocalAnalysis }) {
  const baseline = evidence.pageBaseline;
  const theme = design.theme;
  const heroStyle = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, color: theme.text };
  const previewHtml = useMemo(() => design.renderHtml ? neutralizePreviewHtml(design.renderHtml) : '', [design.renderHtml]);
  if (design.renderHtml) return <div className="generated-preview generated-page-preview growth-html-preview" style={{ background: theme.background, color: theme.text }}>
    <div className="generated-browser">
      <div className="generated-browser-bar" style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}` }}><span /><span /><span /><b>{design.pageName} · 实时模型页面</b></div>
      <iframe title={`${design.pageName} 新版 UI 预览`} sandbox="" referrerPolicy="no-referrer" srcDoc={previewHtml} />
    </div>
  </div>;
  return <div className="generated-preview generated-page-preview" style={{ background: theme.background, color: theme.text }}>
    <div className="generated-browser">
      <div className="generated-browser-bar" style={{ background: theme.surface, borderBottom: `1px solid ${theme.border}` }}>
        <span /><span /><span /><b>{design.pageName || baseline?.siteName || new URL(evidence.url).hostname}</b>
      </div>
      <div className="generated-page">
        <div className="generated-topbar" style={{ borderColor: theme.border }}>
          <b>{design.pageName}</b>
          <nav>
            <span>{design.theme.tone}</span>
            <span>{design.audience}</span>
            <button style={{ background: theme.accent, color: theme.surface }}>{design.hero.primaryCta}</button>
          </nav>
        </div>
        <section className="generated-hero generated-hero-design" style={heroStyle}>
          <div className="hero-copy">
            <small style={{ color: theme.accent }}>{design.hero.eyebrow}</small>
            <h3>{design.hero.title}</h3>
            <p>{design.hero.description}</p>
            <div className="hero-actions">
              <button style={{ background: theme.accent, color: theme.surface }}>{design.hero.primaryCta}</button>
              <button className="preview-secondary" style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }}>{design.hero.secondaryCta}</button>
            </div>
            <div className="hero-tags">
              {design.hero.supportingPoints.map((item, itemIndex) => <span key={`support-${itemIndex}`} style={{ background: theme.surfaceAlt, borderColor: theme.border, color: theme.text }}>{safeDesignText(item)}</span>)}
            </div>
          </div>
          <aside className="hero-rail" style={{ background: theme.accent, color: theme.surface }}>
            <b>{design.strategy}</b>
            <span>{baseline ? `${baseline.siteName} · ${baseline.pageTitle}` : evidence.url}</span>
            <small>{design.mobile}</small>
          </aside>
        </section>
        <section className="preview-signal-strip">
          <article><span>页面语气</span><b>{design.theme.tone}</b><small>{design.theme.motion}</small></article>
          <article><span>原页基线</span><b>{baseline?.pageTitle || '未抓取'}</b><small>{baseline ? baseline.siteName : '需先抓取 URL'}</small></article>
          <article><span>页面目标</span><b>{evidence.goal}</b><small>{evidence.behavior.sourceName}</small></article>
          <article><span>生成模型</span><b>{design.sourceModel || '未知'}</b><small>{design.sourceModelId || '未记录'}</small></article>
        </section>
        <section className="preview-story-grid">
          {design.sections.slice(0, 4).map((section, index) => <article className="story-card story-design" key={`${section.kind}-${index}`} style={{ background: theme.surface, borderColor: theme.border }}>
            <i>{String(index + 1).padStart(2, '0')}</i>
            <b>{section.title}</b>
            <p>{'description' in section && section.description ? section.description : ('body' in section ? section.body : section.kind)}</p>
            <small>{section.kind}</small>
          </article>)}
        </section>
        <section className="preview-conversion-zone" style={{ background: theme.surface, borderColor: theme.border }}>
          <div>
            <span>推荐上线结构</span>
            <h4>{design.strategy}</h4>
            <p>{design.desktop}</p>
          </div>
          <div className="conversion-steps">
            {design.events.slice(0, 4).map((event) => <article key={event.event} style={{ background: theme.surfaceAlt, borderColor: theme.border }}><code>{event.event}</code><small>{event.purpose}</small></article>)}
          </div>
        </section>
        <section className="preview-design-stack">
          {design.sections.map((section, index) => renderDesignSection(section, theme, index))}
        </section>
        <section className="preview-notes" style={{ background: theme.surface, borderColor: theme.border }}>
          <div>
            <span>设计备注</span>
            <p>{safeDesignTextArray(design.notes).join(' · ')}</p>
          </div>
          <div>
            <span>行为依据</span>
            <p>{local.insights.slice(0, 3).map((item) => item.title).join(' · ')}</p>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function GeneratedHtmlPreview({ results, jobs, activeModelId, onSelectModel, onRetryJob, evidence, prompt }: { results: HtmlDesignResult[]; jobs: HtmlGenerationJob[]; activeModelId: string; onSelectModel(id: string): void; onRetryJob(jobId: string): void; evidence: Evidence; prompt: string }) {
  const modelIds = [...new Set([...jobs.map((job) => job.modelId), ...results.map((item) => item.modelId)])];
  const activeModelIdResolved = modelIds.includes(activeModelId) ? activeModelId : results.find((item) => item.status === 'success' && item.output?.html)?.modelId || modelIds[0];
  const activeResult = results.find((item) => item.modelId === activeModelIdResolved);
  const activeJob = jobs.find((job) => job.modelId === activeModelIdResolved);
  const previewHtml = useMemo(() => activeResult?.output?.html ? neutralizePreviewHtml(activeResult.output.html) : '', [activeResult?.output?.html]);
  const succeededCount = jobs.filter((job) => job.status === 'success' && results.some((item) => item.modelId === job.modelId && item.output?.html)).length;
  const failedCount = jobs.filter((job) => job.status === 'failed' || job.status === 'timeout').length;

  return <section className="html-generation-result" aria-label="模型生成的 HTML 页面">
    <div className="html-generation-status" role="status" aria-live="polite">
      <span className="html-generation-count">{succeededCount} 个可预览{failedCount ? ` · ${failedCount} 个失败` : ''}</span>
    </div>
    <div className="html-model-tabs" role="tablist" aria-label="切换模型生成结果">
      {modelIds.map((modelId) => {
        const item = results.find((result) => result.modelId === modelId);
        const job = jobs.find((candidate) => candidate.modelId === modelId);
        const status = job?.status || item?.status || 'queued';
        const active = activeModelIdResolved === modelId;
        const label = status === 'success' ? `${item?.latencyMs || 0}ms · HTML` : status === 'running' || status === 'streaming' || status === 'queued' ? '生成中' : '生成失败';
        return <button type="button" role="tab" aria-selected={active} className={`${active ? 'active' : ''} ${status === 'failed' || status === 'timeout' ? 'failed' : ''}`} onClick={() => onSelectModel(modelId)} key={modelId}>
          <span><b>{job?.modelName || item?.modelName || modelId}</b><small>{label}</small></span>
          {status === 'success' ? <CircleCheck size={15} /> : status === 'running' || status === 'streaming' || status === 'queued' ? <LoaderCircle className="spin" size={15} /> : <CircleAlert size={15} />}
        </button>;
      })}
    </div>
    {activeResult?.status === 'success' && activeResult.output?.html
      ? <>
        <TextDisclosure label="查看生成页面预览" className="html-result-disclosure">
          <div className="raw-html-preview-card">
            <div className="raw-html-preview-toolbar"><div><b>{activeResult.modelName}</b><span>独立 HTML 输出 · 当前页面：{evidence.url}</span></div><span>{activeResult.output.parseMode === 'strict' ? '完整 HTML' : '已从原始输出恢复'}</span></div>
            <iframe title={`${activeResult.modelName} 生成的新版 UI`} sandbox="" referrerPolicy="no-referrer" srcDoc={previewHtml} />
          </div>
        </TextDisclosure>
        <TextDisclosure label="查看 HTML 源码" className="html-result-disclosure">
          <section className="raw-html-source"><b>该模型返回的 HTML 源码</b><pre>{activeResult.output.html}</pre></section>
        </TextDisclosure>
      </>
      : activeJob && (activeJob.status === 'running' || activeJob.status === 'streaming' || activeJob.status === 'queued')
        ? <div className="html-generation-error html-generation-pending"><LoaderCircle className="spin" size={18} /><div><b>{activeJob.modelName} 正在生成 HTML</b><InfoHint label="生成中说明">任务完成后会自动出现在当前结果区；已成功的页面可以先查看。</InfoHint></div></div>
        : <div className="html-generation-error"><CircleAlert size={18} /><div><b>{activeJob?.modelName || activeResult?.modelName || '模型结果'} 未返回可渲染页面</b><p>{providerErrorMessage(activeJob?.error || activeResult?.error)}</p>{providerErrorMeta(activeJob?.error || activeResult?.error) && <small className="provider-error-meta">{providerErrorMeta(activeJob?.error || activeResult?.error)}</small>}{providerErrorRaw(activeJob?.error || activeResult?.error) && <div className="provider-error-raw"><b>服务商原始报错</b><pre>{providerErrorRaw(activeJob?.error || activeResult?.error)}</pre></div>}<button type="button" className="compact-action" onClick={() => activeJob && onRetryJob(activeJob.jobId)} disabled={!activeJob || !providerErrorRetryable(activeJob.error) || activeJob.status === 'running' || activeJob.status === 'streaming'} title={activeJob && !providerErrorRetryable(activeJob.error) ? '该错误不建议重试，请更换模型或调整 Prompt。' : undefined}>{activeJob && !providerErrorRetryable(activeJob.error) ? '不可重试，请更换模型' : '重新测试该模型'}</button></div></div>}
    <TextDisclosure label="查看本次生成 Prompt" className="html-result-disclosure">
      <div className="html-generation-meta"><span>本次生成 Prompt</span><pre>{prompt}</pre></div>
    </TextDisclosure>
  </section>;
}

function GeneratedDesignLogic({ design, evidence, local }: { design: GeneratedPageDesign; evidence: Evidence; local: LocalAnalysis }) {
  const hotspots = topHotspots(evidence);
  return <section className="generation-logic">
    <div className="generation-copy">
      <span>生成逻辑</span>
      <h3>这版页面直接来自模型输出，不是固定模板。</h3>
      <InfoHint label="生成逻辑说明">模型先读页面 URL、热力图和点击热点，再结合上一步分析反馈输出页面主题、hero、区块顺序、桌面/移动布局和事件合同。不同页面会得到不同 section 组合。</InfoHint>
    </div>
    <div className="generation-grid">
      <article><b>1. 页面名称</b><p>{design.pageName}</p><small>{design.strategy}</small></article>
      <article><b>2. 证据输入</b><p>{evidence.behavior.sourceName} · {evidence.behavior.range}</p><small>{evidence.heatmapName ? '含热力图截图' : '当前未导入热力图'}</small></article>
      <article><b>3. 高兴趣区</b><p>{hotspots.slice(0, 2).map((item) => item.name).join(' / ') || '待补充'}</p><small>{hotspots[0] ? `${number.format(hotspots[0].clicks)} 次点击` : '暂无行为热点'}</small></article>
      <article><b>4. 生成结果</b><p>{local.insights.length} 条规则洞察 · {design.sections.length} 个区块</p><small>{design.notes.length ? design.notes[0] : '输出桌面/移动结构、事件合同和上线复盘建议'}</small></article>
    </div>
  </section>;
}

type HeatmapTool = 'pointer' | 'rect' | 'circle';
type HeatmapAnchor = { x: number; y: number; width: number; height: number; shape: Exclude<HeatmapTool, 'pointer'> | 'point' };
type AnalysisSourceIssue = { id: string; severity: Insight['priority']; title: string; diagnosis: string; action: string; actionHighlights: string[]; evidence: string[]; validation: string; guardrail: string };
type AnalysisSource = { id: string; type: 'local' | 'model'; name: string; version: string; tokens?: number; duration: string; counts: { p0: number; p1: number }; summary: string; issues: AnalysisSourceIssue[]; status: 'success' | 'failed'; raw: unknown; modelId?: string; result?: ModelResult };

function issueFromInsight(insight: Insight, index: number, sourceId: string): AnalysisSourceIssue {
  return { id: `${sourceId}-${insight.id || index}`, severity: insight.priority, title: insight.title, diagnosis: insight.interpretation, action: insight.action, actionHighlights: [insight.action], evidence: insight.evidence, validation: insight.validation, guardrail: insight.guardrail };
}

function sourceCounts(issues: AnalysisSourceIssue[]) {
  return { p0: issues.filter((issue) => issue.severity === 'P0').length, p1: issues.filter((issue) => issue.severity === 'P1').length };
}

type SynthesizerProps = {
  selectedModelIds: string[];
  results: ModelResult[];
  htmlJobs: HtmlGenerationJob[];
  htmlGenerating: boolean;
  canGenerate: boolean;
  uiPrompt: string;
  composedPrompt: string;
  onChangeUiPrompt(value: string): void;
  onGenerateHtml(): void;
};

function PromptSynthesizer({ selectedModelIds, results, htmlJobs, htmlGenerating, canGenerate, uiPrompt, composedPrompt, onChangeUiPrompt, onGenerateHtml }: SynthesizerProps) {
  const cards = useMemo(() => selectedModelIds.map((modelId) => {
    const job = htmlJobs.find((item) => item.modelId === modelId);
    const model = results.find((item) => item.modelId === modelId);
    return { modelId, modelName: job?.modelName || model?.modelName || modelId, status: job?.status || 'queued' as const, error: job?.error };
  }), [htmlJobs, results, selectedModelIds]);
  const pending = cards.filter((card) => card.status === 'queued' || card.status === 'running' || card.status === 'streaming').length;
  const completed = cards.filter((card) => card.status === 'success').length;
  const failed = cards.filter((card) => card.status === 'failed' || card.status === 'timeout').length;
  const unlocked = completed > 0;

  function renderStatus(card: (typeof cards)[number]) {
    if (card.status === 'running') return { icon: <LoaderCircle className="spin" size={14} />, label: '生成中' };
    if (card.status === 'success') return { icon: <CircleCheck size={14} />, label: '独立 HTML 已完成' };
    if (card.status === 'failed' || card.status === 'timeout') return { icon: <CircleAlert size={14} />, label: '生成失败 · 第 3 步查看详情' };
    return { icon: <Clock3 size={14} />, label: '待生成' };
  }

  return <section className="prompt-synthesizer-section" aria-label="Prompt 合成器">
    <header className="prompt-synthesizer-header">
      <div><span className="module-kicker"><Sparkles size={13} /> Prompt 合成器</span><h3>独立 UI 生成任务</h3></div>
      <div className="prompt-synthesizer-counts" aria-label="生成任务计数"><span>待生成 {pending}</span><span>结果 {completed}</span>{failed > 0 && <span className="synthesizer-failed-count">失败 {failed}</span>}</div>
    </header>
    <div className="prompt-synthesizer-grid">
      <label className="synthesizer-intent"><span>改版意图 <em className="field-optional">可编辑</em></span><textarea aria-label="改版意图" value={uiPrompt} onChange={(event) => onChangeUiPrompt(event.target.value)} rows={5} /></label>
      <div className="composed-prompt-preview" aria-label="实时合成 Prompt"><div><span>实时预览</span></div><pre>{composedPrompt.split('\n').map((line, index) => { const dynamic = line.startsWith('- 生成模型：') || line.startsWith('- 热力图视觉输入：') || line.startsWith('- 已确认坐标：') || line.startsWith('- P0 ') || line.startsWith('- P1 ') || line.startsWith('- P2 '); return <span key={`${index}-${line.slice(0, 24)}`}>{dynamic ? <mark>{line || ' '}</mark> : line || ' '}\n</span>; })}</pre></div>
    </div>
    <div className="synthesizer-model-cards" aria-label="已勾选模型生成状态">
      {cards.length ? cards.map((card) => { const status = renderStatus(card); return <article key={card.modelId} className={`synthesizer-model-card job-${card.status}`}><span>{status.icon}</span><div><b>{card.modelName}</b><small>{status.label}</small></div></article>; }) : <div className="synthesizer-empty">未选择生成模型</div>}
    </div>
    <div className="synthesizer-action-bar">
      <small>任一模型成功返回 HTML 即可进入第 3 步；失败项在结果页单独处理。</small>
      <button type="button" className="compact-action primary" onClick={onGenerateHtml} disabled={!canGenerate || !selectedModelIds.length || htmlGenerating}>{htmlGenerating ? <><LoaderCircle className="spin" size={14} /> 生成中</> : unlocked ? <><CircleCheck size={14} /> 第 3 步已解锁</> : failed > 0 ? <><Sparkles size={14} /> 重新生成失败项</> : <><Sparkles size={14} /> 生成 {selectedModelIds.length} 个 Job</>}</button>
    </div>
  </section>;
}

function AnalysisPendingState({ running, label }: { running: boolean; label: string }) {
  return <div className={`analysis-pending-state ${running ? 'is-running' : ''}`} role="status" aria-live="polite">
    <span className="analysis-pending-orbit" aria-hidden="true"><span />{running ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={18} />}</span>
    <b>{label}</b>
  </div>;
}

function parseHeatmapAnchor(value: string): HeatmapAnchor | undefined {
  const match = value.match(/@\s*([\d.]+)%,\s*([\d.]+)%\s*\((point|rect|circle)(?:;\s*([\d.]+)%\s*[x×]\s*([\d.]+)%)?\)/i);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]), shape: match[3].toLowerCase() as HeatmapAnchor['shape'], width: Number(match[4]) || 8, height: Number(match[5]) || 8 };
}

function EvidenceWorkbench({ behavior, heatmapUrl, heatmapName, heatmapCoordinates = {}, markedCtas, onToggleCta, local, results, analysisRunning, selectedHtmlModelIds, htmlGenerating, uiPrompt, composedPrompt, htmlJobs, onSelectModel, onToggleHtmlModel, onChangeUiPrompt, onGenerateHtml, onCoordinateChange }: {
  behavior: ImportedClicks;
  heatmapUrl: string;
  heatmapName: string;
  heatmapCoordinates?: Record<string, string>;
  markedCtas: string[];
  onToggleCta(item: ElementRecord): void;
  local?: LocalAnalysis;
  results: ModelResult[];
  analysisRunning: boolean;
  selectedHtmlModelIds: string[];
  htmlGenerating: boolean;
  uiPrompt: string;
  composedPrompt: string;
  htmlJobs: HtmlGenerationJob[];
  onSelectModel(id: string): void;
  onToggleHtmlModel(id: string): void;
  onChangeUiPrompt(value: string): void;
  onGenerateHtml(): void;
  onCoordinateChange(id: string, value: string): void;
}) {
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<HeatmapTool>('pointer');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | ElementRecord['kind']>('all');
  const [sort, setSort] = useState<'clicks' | 'share' | 'name'>('clicks');
  const [activeId, setActiveId] = useState(markedCtas.find((id) => behavior.elements.some((item) => item.id === id)) || behavior.elements[0]?.id || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(markedCtas.length ? markedCtas : behavior.elements.slice(0, 1).map((item) => item.id));
  const [anchors, setAnchors] = useState<Record<string, HeatmapAnchor>>(() => Object.fromEntries(Object.entries(heatmapCoordinates).flatMap(([id, value]) => { const anchor = parseHeatmapAnchor(value); return anchor ? [[id, anchor]] : []; })));
  const [draftAnchor, setDraftAnchor] = useState<HeatmapAnchor>();
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [isNarrowAnalysis, setIsNarrowAnalysis] = useState(false);
  const [detailView, setDetailView] = useState<'findings' | 'raw'>('findings');
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const masterScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)');
    const update = () => setIsNarrowAnalysis(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!behavior.elements.some((item) => item.id === activeId)) setActiveId(behavior.elements[0]?.id || '');
    setSelectedIds((current) => current.filter((id) => behavior.elements.some((item) => item.id === id)));
  }, [activeId, behavior.elements]);

  useEffect(() => {
    setAnchors(Object.fromEntries(Object.entries(heatmapCoordinates).flatMap(([id, value]) => { const anchor = parseHeatmapAnchor(value); return anchor ? [[id, anchor]] : []; })));
  }, [heatmapCoordinates]);

  const filteredElements = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return behavior.elements.filter((item) => (!normalized || `${item.name} ${item.module || ''} ${item.selector || ''}`.toLowerCase().includes(normalized)) && (kindFilter === 'all' || item.kind === kindFilter)).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort === 'share' ? b.share - a.share : b.clicks - a.clicks);
  }, [behavior.elements, kindFilter, query, sort]);
  const activeElement = behavior.elements.find((item) => item.id === activeId) || filteredElements[0];
  const selectedClickTotal = behavior.elements.filter((item) => selectedIds.includes(item.id)).reduce((sum, item) => sum + item.clicks, 0);
  const selectedShare = behavior.clicks ? Number((selectedClickTotal / behavior.clicks * 100).toFixed(1)) : 0;
  const rankedElements = useMemo(() => [...behavior.elements].sort((a, b) => b.clicks - a.clicks), [behavior.elements]);
  const activeRank = activeElement ? rankedElements.findIndex((item) => item.id === activeElement.id) + 1 : 0;
  const topElement = rankedElements[0];
  const selectedElements = behavior.elements.filter((item) => selectedIds.includes(item.id));
  const activeIsCta = Boolean(activeElement && markedCtas.includes(activeElement.id));
  const activeSignals = activeElement ? [
    {
      tone: 'evidence', label: '数据证据', title: `点击排名 ${activeRank}/${behavior.elements.length}`,
      body: `${number.format(activeElement.clicks)} 次记录点击，占页面已记录点击 ${activeElement.share}%。该数值只说明点击分布。`,
    },
    {
      tone: activeIsCta ? 'attention' : activeRank <= Math.max(2, Math.ceil(behavior.elements.length * .25)) ? 'positive' : 'neutral',
      label: '运营判断',
      title: activeIsCta ? (topElement && activeElement.clicks < topElement.clicks * .5 ? '核心动作的点击份额低于头部元素' : '核心动作已获得可见点击') : activeRank <= Math.max(2, Math.ceil(behavior.elements.length * .25)) ? '高关注元素，需要确认是否承接主路径' : '当前属于次级关注元素',
      body: activeIsCta
        ? `已标记为核心 CTA。与最高点击元素“${topElement?.name || activeElement.name}”对照，仍需结合曝光、CTA 点击 UV 与目标完成数据判断效率。`
        : `当前未标记为核心 CTA。${activeRank <= Math.max(2, Math.ceil(behavior.elements.length * .25)) ? '若它不是业务主路径，应检查是否分流了核心 CTA 的注意力。' : '可结合页面位置判断是否下沉、合并或保留。'}`,
    },
    {
      tone: 'action', label: '建议动作',
      title: activeIsCta ? '补齐从点击到目标完成的验证链' : '先确认业务角色，再决定视觉权重',
      body: activeIsCta
        ? '补充 module_exposure、cta_click、goal_start 与 goal_complete，按页面版本复盘。'
        : '确认该元素的模块、目标链接与用户意图；需要时标记为核心 CTA，或在新版中降低竞争性。',
    },
  ] : [];

  const analysisSources = useMemo<AnalysisSource[]>(() => {
    const localSource = local ? (() => {
      const issues = local.insights.map((insight, index) => issueFromInsight(insight, index, 'local'));
      return { id: 'local', type: 'local' as const, name: '本地规则引擎', version: '运营知识库确定性命中', duration: '本地规则', counts: sourceCounts(issues), summary: local.insights[0]?.action || '本地规则尚未命中需要优先处理的页面问题。', issues, status: 'success' as const, raw: local };
    })() : undefined;
    const modelSources = results.map((result) => {
      const issues = result.output?.insights?.map((insight, index) => issueFromInsight(insight, index, result.modelId)) || [];
      return { id: result.modelId, type: 'model' as const, name: result.modelName, version: result.status === 'success' ? '结构化分析输出' : '调用失败', tokens: undefined, duration: result.status === 'success' ? `${result.latencyMs}ms` : '未完成', counts: sourceCounts(issues), summary: result.output?.summary || formatProviderError(result.error, '该模型没有返回结构化分析摘要。'), issues, status: result.status, raw: result.output || result.error, modelId: result.modelId, result };
    });
    return localSource ? [localSource, ...modelSources] : modelSources;
  }, [local, results]);

  useEffect(() => {
    if (!analysisSources.length) { setSelectedSourceId(''); return; }
    if (!analysisSources.some((source) => source.id === selectedSourceId)) setSelectedSourceId(analysisSources[0].id);
  }, [analysisSources, selectedSourceId]);

  const selectedSource = analysisSources.find((source) => source.id === selectedSourceId) || analysisSources[0];

  useEffect(() => {
    if (!selectedSourceId) return;
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    const detail = detailScrollRef.current;
    if (!detail) return;
    const items = Array.from(detail.querySelectorAll<HTMLElement>('[data-analysis-reveal]'));
    if (!('IntersectionObserver' in window)) { items.forEach((item) => item.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { root: detail, threshold: .12 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [selectedSourceId, detailView, selectedSource?.issues.length]);

  function selectAnalysisSource(id: string) {
    setSelectedSourceId(id);
    const source = analysisSources.find((item) => item.id === id);
    if (source?.modelId) onSelectModel(source.modelId);
  }

  function handleSourceKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!analysisSources.length) return;
    const currentIndex = Math.max(0, analysisSources.findIndex((source) => source.id === selectedSourceId));
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown' || (isNarrowAnalysis && event.key === 'ArrowRight')) nextIndex = Math.min(analysisSources.length - 1, currentIndex + 1);
    else if (event.key === 'ArrowUp' || (isNarrowAnalysis && event.key === 'ArrowLeft')) nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = analysisSources.length - 1;
    else return;
    event.preventDefault();
    const nextSource = analysisSources[nextIndex];
    selectAnalysisSource(nextSource.id);
    window.requestAnimationFrame(() => document.getElementById(`analysis-source-${nextSource.id}`)?.scrollIntoView({ block: 'nearest' }));
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = imageBoxRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
  }
  function focusElement(id: string) {
    setActiveId(id);
    window.requestAnimationFrame(() => {
      document.getElementById('selected-area-analysis')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
  function saveAnchor(id: string, anchor: HeatmapAnchor) {
    setAnchors((items) => ({ ...items, [id]: anchor }));
    const element = behavior.elements.find((item) => item.id === id);
    if (element) onCoordinateChange(id, `${element.name} @ ${anchor.x.toFixed(1)}%, ${anchor.y.toFixed(1)}% (${anchor.shape}; ${anchor.width.toFixed(1)}% × ${anchor.height.toFixed(1)}%)`);
    focusElement(id);
  }
  function clearAnchor(id: string) {
    setAnchors((items) => { const next = { ...items }; delete next[id]; return next; });
    onCoordinateChange(id, '');
  }
  function handleImageClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool !== 'pointer' || !activeElement) return;
    const point = pointFromEvent(event);
    saveAnchor(activeElement.id, { x: point.x, y: point.y, width: 8, height: 8, shape: 'point' });
  }
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'pointer') return;
    const point = pointFromEvent(event);
    dragStart.current = point;
    setDraftAnchor({ x: point.x, y: point.y, width: 0, height: 0, shape: tool });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'pointer' || !dragStart.current) return;
    const start = dragStart.current; const end = pointFromEvent(event);
    const width = Math.abs(end.x - start.x); const height = Math.abs(end.y - start.y);
    const x = Math.min(start.x, end.x); const y = Math.min(start.y, end.y);
    const size = tool === 'circle' ? Math.min(Math.max(width, height), 100 - x, 100 - y) : undefined;
    setDraftAnchor({ x, y, width: size || width, height: size || height, shape: tool });
  }
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (tool === 'pointer' || !dragStart.current || !activeElement) return;
    const start = dragStart.current; const end = pointFromEvent(event); dragStart.current = undefined;
    const width = Math.max(6, Math.abs(end.x - start.x)); const height = Math.max(6, Math.abs(end.y - start.y));
    const x = Math.min(start.x, end.x); const y = Math.min(start.y, end.y);
    const size = tool === 'circle' ? Math.min(Math.max(width, height), 100 - x, 100 - y) : undefined;
    setDraftAnchor(undefined);
    saveAnchor(activeElement.id, { x, y, width: size || width, height: size || height, shape: tool });
  }
  function handlePointerCancel() { dragStart.current = undefined; setDraftAnchor(undefined); }
  function toggleSelected(id: string) { setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); setActiveId(id); }
  function markSelectedAsCta() { behavior.elements.filter((item) => selectedIds.includes(item.id) && !markedCtas.includes(item.id)).forEach(onToggleCta); }
  function selectFiltered() { setSelectedIds((items) => [...new Set([...items, ...filteredElements.map((item) => item.id)])]); if (filteredElements[0]) setActiveId(filteredElements[0].id); }
  function clearSelected() { setSelectedIds([]); }
  function resetFilters() { setQuery(''); setKindFilter('all'); setSort('clicks'); }
  return <section className="evidence-workbench" aria-label="热力图证据工作台">
    <header className="evidence-workbench-head">
      <div><span className="canvas-eyebrow">证据工作台</span><h2>热力图与分析结果联动</h2><div className="evidence-meta-line"><strong title={heatmapName || '未上传热力图'}>{heatmapName || '未上传热力图'}</strong><span><b>{number.format(behavior.clicks)}</b> 次点击</span><span><b>{behavior.elements.length}</b> 个元素</span></div></div>
      <div className="evidence-kpis"><div><b>{selectedIds.length}</b><span>选中元素</span></div><div><b>{selectedShare}%</b><span>选中点击份额</span></div></div>
    </header>
    <div className="evidence-canvas-grid">
      <div className="heatmap-pane">
        <div className="heatmap-toolbar">
          <div className="toolbar-group" aria-label="热力图选择工具">
            <button type="button" aria-pressed={tool === 'pointer'} className={tool === 'pointer' ? 'active' : ''} onClick={() => setTool('pointer')} title="点击定位"><MousePointer2 size={15} />点标注</button>
            <button type="button" aria-pressed={tool === 'rect'} className={tool === 'rect' ? 'active' : ''} onClick={() => setTool('rect')} title="拖拽矩形选择"><Square size={15} />框选</button>
            <button type="button" aria-pressed={tool === 'circle'} className={tool === 'circle' ? 'active' : ''} onClick={() => setTool('circle')} title="拖拽圆形选择"><CircleDashed size={15} />圈选</button>
          </div>
          <div className="toolbar-group heatmap-zoom" aria-label="缩放热力图">
            <button type="button" onClick={() => setZoom((value) => Math.max(.75, Number((value - .25).toFixed(2))))} title="缩小"><ZoomOut size={15} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(2, Number((value + .25).toFixed(2))))} title="放大"><ZoomIn size={15} /></button>
          </div>
        </div>
        <div className="heatmap-stage-scroll">
          {heatmapUrl ? <div className={`heatmap-stage tool-${tool}`} ref={imageBoxRef} style={{ width: `${zoom * 100}%` }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onClick={handleImageClick}>
            <img src={heatmapUrl} alt="上传的页面热力图" draggable={false} />
            <div className="coordinate-grid" aria-hidden="true" />
            <div className="heatmap-overlay-hint"><Crosshair size={13} /> 当前标注：{activeElement?.name || '请先选择右侧元素'} · {tool === 'pointer' ? '点击落点' : '拖拽选区'}</div>
            {draftAnchor && <div className={`heatmap-anchor draft ${draftAnchor.shape}`} style={{ left: `${draftAnchor.x}%`, top: `${draftAnchor.y}%`, width: `${draftAnchor.width}%`, height: `${draftAnchor.height}%` }} aria-hidden="true" />}
            {Object.entries(anchors).map(([id, anchor]) => {
              const item = behavior.elements.find((element) => element.id === id); if (!item) return null;
              return <button type="button" key={id} className={`heatmap-anchor ${anchor.shape} ${activeId === id ? 'active' : ''}`} style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, width: `${anchor.width}%`, height: `${anchor.height}%` }} onClick={(event) => { event.stopPropagation(); focusElement(id); }} aria-label={`定位 ${item.name}`}><span>{item.name}</span></button>;
            })}
          </div> : <div className="heatmap-empty"><Layers3 size={28} /><b>等待热力图截图</b><InfoHint label="热力图说明">上传截图后，可以在图上定位元素并与右侧分析联动。</InfoHint></div>}
        </div>
        <div className="heatmap-caption"><span><Crosshair size={13} /> 当前区域：{activeElement ? activeElement.name : '未选择'}</span><span>{anchors[activeElement?.id || ''] ? `坐标 ${Math.round(anchors[activeElement?.id || ''].x)}%, ${Math.round(anchors[activeElement?.id || ''].y)}%` : '点击或拖拽图像建立坐标'}</span></div>
      </div>
      <aside className="analysis-pane" aria-label="热力图分析结果">
        <header className="analysis-pane-head">
          <div><span className="module-kicker"><Crosshair size={13} /> 区域检查器</span><b>{activeElement?.name || '选择一个元素'}</b></div>
          <span>{selectedIds.length} 个已选</span>
        </header>
        <section className="analysis-module-card element-confirm-card">
          <header><div><span className="module-kicker"><ListFilter size={13} /> 元素确认</span><h3>选择需要追踪的元素</h3></div><button type="button" className="compact-action" onClick={markSelectedAsCta} disabled={!selectedIds.length}><Check size={14} />批量标记核心</button></header>
          <div className="element-filters"><label><SlidersHorizontal size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选元素、模块或选择器" /></label><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="元素类型筛选"><option value="all">全部类型</option><option value="CTA">CTA</option><option value="内容">内容</option><option value="导航">导航</option></select><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="元素排序"><option value="clicks">点击最多</option><option value="share">份额最高</option><option value="name">名称排序</option></select></div>
          <div className="batch-selection-bar"><span><b>{filteredElements.length}</b> / {behavior.elements.length} 项 · 已勾选 {selectedIds.length} 项</span><div><button type="button" onClick={selectFiltered} disabled={!filteredElements.length}>全选结果</button><button type="button" onClick={clearSelected} disabled={!selectedIds.length}>清空勾选</button><button type="button" onClick={resetFilters} disabled={!query && kindFilter === 'all' && sort === 'clicks'}>重置筛选</button></div></div>
          <div className="element-list" role="listbox" aria-label="可分析元素">
            {filteredElements.map((item, index) => <div id={`evidence-element-${behavior.elements.findIndex((element) => element.id === item.id)}`} className={`element-list-row ${activeId === item.id ? 'active' : ''}`} key={item.id} onClick={() => focusElement(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') focusElement(item.id); }} role="option" tabIndex={0} aria-selected={activeId === item.id}>
              <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${item.name}`} /><span className="element-row-index">{String(index + 1).padStart(2, '0')}</span><span className="element-row-copy"><b>{item.name}</b><small>{item.module || item.selector || item.kind}{markedCtas.includes(item.id) ? ' · 核心 CTA' : ''}</small></span><strong>{number.format(item.clicks)}<small>{item.share}%</small></strong>
            </div>)}
            {!filteredElements.length && <div className="element-list-empty">没有符合条件的元素。</div>}
          </div>
        </section>
        <section id="selected-area-analysis" className="analysis-module-card selected-detail-card">
          <header><div><span className="module-kicker"><Crosshair size={13} /> 选中区域</span><h3>{activeElement?.name || '尚未选择'}</h3></div>{activeElement && <span className={`kind-badge kind-${activeElement.kind}`}>{activeElement.kind}</span>}</header>
          {activeElement ? <><div className="selected-detail-grid"><div><span>点击次数</span><b>{number.format(activeElement.clicks)}</b></div><div><span>点击份额</span><b>{activeElement.share}%</b></div><div><span>页面位置</span><b>{activeElement.module || '待补模块'}</b></div><div><span>坐标</span><b>{anchors[activeElement.id] ? `${Math.round(anchors[activeElement.id].x)}%, ${Math.round(anchors[activeElement.id].y)}%` : '待定位'}</b></div></div>{anchors[activeElement.id] && <button type="button" className="clear-coordinate-action" onClick={() => clearAnchor(activeElement.id)}>清除当前标注</button>}</> : <p className="module-empty-copy">待选择元素</p>}
          {activeElement && <div className="element-signal-list">{activeSignals.map((signal) => <article className={`element-signal ${signal.tone}`} key={signal.label}><span>{signal.label}</span><b>{signal.title}</b><p>{signal.body}</p></article>)}</div>}
        </section>
        <section className="analysis-module-card insights-card">
          <header><div><span className="module-kicker"><Sparkles size={13} /> 本地规则洞察</span><h3>证据驱动的优先动作</h3></div>{local && <span className="quality-badge">质量 {local.quality}</span>}</header>
          {local ? <div className="compact-insight-list">{local.insights.slice(0, 4).map((insight) => <article key={insight.id} className={`compact-insight ${insight.priority.toLowerCase()}`}><div><span>{insight.priority}</span><b>{insight.title}</b></div><p>{insight.action}</p></article>)}</div> : <AnalysisPendingState running={analysisRunning} label={analysisRunning ? '本地规则匹配中' : '等待开始分析'} />}
        </section>
      </aside>
    </div>
    <section className="model-analysis-section" aria-label="模型分析反馈">
      <header><div><span className="module-kicker"><Layers3 size={13} /> 模型分析</span><h3>模型分析反馈</h3></div>{results.length > 0 && <span className="quality-badge">{selectedHtmlModelIds.length} 个待生成 / {results.length} 个模型</span>}</header>
      {analysisSources.length ? <div className="analysis-master-detail">
        <div className="analysis-master-pane" ref={masterScrollRef}>
          <div className="analysis-pane-label"><span>分析源</span><small>{analysisSources.length} 个来源</small></div>
          <div className="analysis-source-list" role="tablist" aria-orientation={isNarrowAnalysis ? 'horizontal' : 'vertical'} aria-label="模型分析来源">
            {analysisSources.map((source) => {
              const selected = selectedSource?.id === source.id;
              return <div id={`analysis-source-${source.id}`} key={source.id} role="tab" tabIndex={selected ? 0 : -1} aria-selected={selected} aria-controls="analysis-detail-panel" className={`analysis-source-item ${selected ? 'selected' : ''}`} onClick={() => selectAnalysisSource(source.id)} onKeyDown={handleSourceKeyDown}>
                <div className="analysis-source-item-head"><span className={`source-type-badge ${source.type}`}>{source.type === 'local' ? '本地规则' : '模型'}</span>{selected && <em>当前查看</em>}<label className="source-select-control" onClick={(event) => event.stopPropagation()}>{source.type === 'local' ? <><input type="checkbox" checked readOnly /><span>硬约束</span></> : <><input type="checkbox" checked={selectedHtmlModelIds.includes(source.id)} onChange={() => onToggleHtmlModel(source.id)} disabled={source.status !== 'success'} /><span>生成 UI</span></>}</label></div>
                <div className="analysis-source-title"><b>{source.name}</b><small>{source.version}</small></div>
                <div className="analysis-source-meta"><span>{source.tokens ? `${source.tokens.toLocaleString()} tokens` : 'tokens 未返回'}</span><span>{source.duration}</span></div>
                <div className="analysis-source-counts"><span className="severity-count p0">P0 × {source.counts.p0}</span><span className="severity-count p1">P1 × {source.counts.p1}</span></div>
                <p>{source.summary}</p>
              </div>;
            })}
          </div>
        </div>
        {selectedSource && <article id="analysis-detail-panel" className="analysis-detail-pane" ref={detailScrollRef} role="tabpanel" aria-labelledby={`analysis-source-${selectedSource.id}`}>
          <header className="analysis-detail-sticky"><div><span className={`source-type-badge ${selectedSource.type}`}>{selectedSource.type === 'local' ? '本地规则' : '模型输出'}</span><h4>{selectedSource.name}</h4><p>{selectedSource.version} · {selectedSource.tokens ? `${selectedSource.tokens.toLocaleString()} tokens` : 'tokens 未返回'} · {selectedSource.duration}</p></div><div className="analysis-detail-view-toggle" role="group" aria-label="反馈视图切换"><button type="button" className={detailView === 'findings' ? 'active' : ''} onClick={() => setDetailView('findings')}>结构化反馈</button><button type="button" className={detailView === 'raw' ? 'active' : ''} onClick={() => setDetailView('raw')}>原始结果</button></div></header>
          <div className="analysis-detail-body">
            {detailView === 'raw' ? <pre className="analysis-raw-output">{JSON.stringify(selectedSource.raw, null, 2)}</pre> : <><p className="analysis-detail-summary">{selectedSource.summary}</p><div className="analysis-issue-list">{selectedSource.issues.length ? selectedSource.issues.map((issue) => <article className="analysis-issue-card reveal-item" data-analysis-reveal key={issue.id}><div className="analysis-issue-head"><span className={`severity-label ${issue.severity.toLowerCase()}`}>{issue.severity}</span><h5>{issue.title}</h5></div><div className="analysis-issue-grid"><section><span>现状诊断</span><p>{issue.diagnosis}</p><small>依据：{issue.evidence.join('；')}</small></section><section className="analysis-action-column"><span>建议动作</span><p>{issue.action}</p><mark>关键改动：{issue.actionHighlights.join('；')}</mark></section></div><footer><span>验证：{issue.validation}</span><span>护栏：{issue.guardrail}</span></footer></article>) : <p className="module-empty-copy">该分析源没有结构化问题卡。</p>}</div></>}
            {selectedSource.type === 'model' && selectedSource.result?.status === 'failed' && <p className="model-feedback-error">{formatProviderError(selectedSource.result.error)}</p>}
          </div>
        </article>}
      </div> : <AnalysisPendingState running={analysisRunning} label={analysisRunning ? (local ? '模型正在逐个返回' : '正在准备本地分析') : '等待开始分析'} />}
    </section>
    <PromptSynthesizer selectedModelIds={selectedHtmlModelIds} results={results} htmlJobs={htmlJobs} htmlGenerating={htmlGenerating} canGenerate={Boolean(local)} uiPrompt={uiPrompt} composedPrompt={composedPrompt} onChangeUiPrompt={onChangeUiPrompt} onGenerateHtml={onGenerateHtml} />
  </section>;
}

export default function Page() {
  const router = useRouter();
  const pathname = usePathname();
  const [consoleView, setConsoleView] = useState<ConsoleView>(consoleViewFromPathname(pathname || '') || 'task');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileToast, setMobileToast] = useState('');
  const [mobileActionPulse, setMobileActionPulse] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]); const [draftId, setDraftId] = useState(''); const [comparisonBaseline, setComparisonBaseline] = useState<PersistedWorkspace['comparisonBaseline']>();
  const [historyId, setHistoryId] = useState('');
  const [url, setUrl] = useState(''); const [goal, setGoal] = useState<Goal>('注册/试用'); const [device, setDevice] = useState('桌面端'); const [audience, setAudience] = useState<Audience>('2B'); const [brandColor, setBrandColor] = useState('#0A9C8A'); const [brandTone, setBrandTone] = useState('科技、可信、克制'); const [primaryCta, setPrimaryCta] = useState(''); const [notes, setNotes] = useState('');
  const [pageBaseline, setPageBaseline] = useState<PageBaseline>(); const [baselineLoading, setBaselineLoading] = useState(false); const [baselineError, setBaselineError] = useState(''); const [demoLoadingId, setDemoLoadingId] = useState('');
  const [behavior, setBehavior] = useState<ImportedClicks>(); const [heatmapName, setHeatmapName] = useState(''); const [heatmapUrl, setHeatmapUrl] = useState(''); const [heatmapPreviewUrl, setHeatmapPreviewUrl] = useState(''); const [heatmapDataUrl, setHeatmapDataUrl] = useState(''); const [includeHeatmapInModel, setIncludeHeatmapInModel] = useState(true); const [markedCtas, setMarkedCtas] = useState<string[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]); const [modelDraft, setModelDraft] = useState<{ name: string; baseUrl: string; model: string; protocol: ModelConfig['protocol']; apiKey: string; reasoningEffort: NonNullable<ModelConfig['reasoningEffort']>; timeoutSeconds: number }>({ name: '', baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'responses', apiKey: '', reasoningEffort: 'medium', timeoutSeconds: 180 }); const [showModelForm, setShowModelForm] = useState(false); const [modelDialogOpen, setModelDialogOpen] = useState(false); const [editingModel, setEditingModel] = useState<ModelConfig>();
  const [local, setLocal] = useState<LocalAnalysis>(); const [results, setResults] = useState<ModelResult[]>([]); const [modelProgress, setModelProgress] = useState<ModelAnalysisProgress[]>([]); const [selectedModelId, setSelectedModelId] = useState(''); const [pageDesign, setPageDesign] = useState<GeneratedPageDesign>(); const [uiPrompt, setUiPrompt] = useState(DEFAULT_UI_PROMPT); const [htmlDesigns, setHtmlDesigns] = useState<HtmlDesignResult[]>([]); const [selectedHtmlModelIds, setSelectedHtmlModelIds] = useState<string[]>([]); const [activeHtmlModelId, setActiveHtmlModelId] = useState(''); const [htmlJobs, setHtmlJobs] = useState<HtmlGenerationJob[]>([]); const [heatmapCoordinates, setHeatmapCoordinates] = useState<Record<string, string>>({}); const [htmlGenerating, setHtmlGenerating] = useState(false); const [retryingJobId, setRetryingJobId] = useState(''); const [running, setRunning] = useState(false); const [error, setError] = useState(''); const [modelError, setModelError] = useState(''); const [notice, setNotice] = useState(''); const [afterBehavior, setAfterBehavior] = useState<ImportedClicks>(); const [hydrated, setHydrated] = useState(false); const [generatingModelId, setGeneratingModelId] = useState(''); const [currentStep, setCurrentStep] = useState<WizardStepIndex>(0); const [evidenceConfirmed, setEvidenceConfirmed] = useState(false);
  const wizardHeaderRef = useRef<HTMLDivElement>(null);
  const wizardTabsRef = useRef<HTMLDivElement>(null);
  const wizardBottomBarRef = useRef<HTMLDivElement>(null);
  const evidence = useMemo<Evidence | undefined>(() => behavior && url ? { url, goal, device, audience, brandColor, brandTone, primaryCta, notes, heatmapName: heatmapName || undefined, heatmapDataUrl: includeHeatmapInModel ? heatmapDataUrl || undefined : undefined, pageBaseline, behavior, markedCtaIds: markedCtas } : undefined, [audience, behavior, brandColor, brandTone, device, goal, heatmapDataUrl, heatmapName, includeHeatmapInModel, markedCtas, notes, pageBaseline, primaryCta, url]);
  const analysisModels = models;
  const enabledModels = models.filter((model) => model.enabled && model.apiKey.trim());
  const availableModels = enabledModels.filter((model) => model.connectionStatus === 'success');
  const hasUnverifiedEnabledModel = enabledModels.some((model) => model.connectionStatus !== 'success');
  const modelProgressSummary = useMemo(() => ({
    queued: modelProgress.filter((item) => item.status === 'queued').length,
    running: modelProgress.filter((item) => item.status === 'running').length,
    success: modelProgress.filter((item) => item.status === 'success').length,
    failed: modelProgress.filter((item) => item.status === 'failed').length,
  }), [modelProgress]);
  const displayedDesign = pageDesign;
  const selectedModelResult = results.find((item) => item.modelId === selectedModelId);
  const activeHtmlAnalysis = results.find((item) => item.modelId === activeHtmlModelId);
  const outputFindings = [...(local?.insights || []).map((item) => ({ ...item, source: '本地规则' })), ...(activeHtmlAnalysis?.output?.insights || []).map((item) => ({ ...item, source: activeHtmlAnalysis?.modelName || '模型分析' }))].filter((item, index, items) => (item.priority === 'P0' || item.priority === 'P1') && items.findIndex((candidate) => candidate.title === item.title) === index);
  const hasHtmlDesign = htmlDesigns.some((item) => item.status === 'success' && item.output?.html);
  const selectedModelTitle = selectedModelResult?.modelName || selectedModelId || '待选择模型';
  const beforeCtaClicks = behavior?.elements.filter((item) => markedCtas.includes(item.id)).reduce((sum, item) => sum + item.clicks, 0) || 0;
  const afterCtaClicks = afterBehavior?.elements.filter((item) => primaryCta && item.name.includes(primaryCta)).reduce((sum, item) => sum + item.clicks, 0) || 0;
  const requiredEvidenceReady = Boolean(url.trim() && heatmapName && behavior && primaryCta.trim() && audience && /^#[0-9A-Fa-f]{6}$/.test(brandColor) && brandTone.trim());
  const selectedGenerationModels = analysisModels.filter((model) => selectedHtmlModelIds.includes(model.id) && model.enabled && model.connectionStatus === 'success' && model.apiKey.trim());
  const composedPrompt = useMemo(() => composeUiPrompt({ instruction: uiPrompt, selectedModels: selectedGenerationModels, includeVisual: includeHeatmapInModel, coordinates: Object.values(heatmapCoordinates), localHits: local?.insights || [], evidence }), [evidence, heatmapCoordinates, includeHeatmapInModel, local?.insights, selectedGenerationModels, uiPrompt]);
  const selectedJobs = htmlJobs.filter((job) => selectedHtmlModelIds.includes(job.modelId));
  const hasInFlightHtmlJobs = selectedJobs.some((job) => job.status === 'queued' || job.status === 'running' || job.status === 'streaming');
  const succeededHtmlJobs = selectedJobs.filter((job) => job.status === 'success' && htmlDesigns.some((item) => item.modelId === job.modelId && item.status === 'success' && Boolean(item.output?.html)));
  const failedHtmlJobs = selectedJobs.filter((job) => job.status === 'failed' || job.status === 'timeout');
  const allHtmlJobsTerminal = selectedJobs.length > 0 && selectedJobs.every((job) => ['success', 'failed', 'timeout', 'cancelled'].includes(job.status));
  const allHtmlJobsFailed = allHtmlJobsTerminal && succeededHtmlJobs.length === 0;
  const selectedJobsComplete = selectedGenerationModels.length > 0 && succeededHtmlJobs.length > 0;
  const currentPanel: WorkspacePanel = wizardStepIds[currentStep];
  const workflowItems = [
    { id: 'input', label: '导入证据', hint: 'URL、热力图、点击表' },
    { id: 'analysis', label: '模型分析', hint: '本地规则、多模型、Prompt' },
    { id: 'output', label: 'UI 结果', hint: '独立 HTML 与优化点' },
    { id: 'review', label: '复盘保存', hint: '改版后数据验证' },
  ];
  const sessionLabel = (() => {
    try { return url ? new URL(url).hostname.replace(/^www\./, '') : '新会话'; } catch { return url || '新会话'; }
  })();

  // The console-main element owns page scrolling. Keep the Wizard's sticky header
  // state and mobile step centering scoped to that shared container.
  useEffect(() => {
    if (consoleView !== 'task') return;
    const header = wizardHeaderRef.current;
    const scrollContainer = header?.closest<HTMLElement>('.console-main');
    if (!header || !scrollContainer) return;
    const updateStuckState = () => header.classList.toggle('is-stuck', scrollContainer.scrollTop > 1);
    updateStuckState();
    scrollContainer.addEventListener('scroll', updateStuckState, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateStuckState);
  }, [consoleView, currentStep]);

  useEffect(() => {
    if (consoleView !== 'task') return;
    const bottomBar = wizardBottomBarRef.current;
    const task = bottomBar?.closest<HTMLElement>('.console-task-view');
    if (!bottomBar || !task || typeof ResizeObserver === 'undefined') return;
    const syncBottomBarHeight = () => task.style.setProperty('--wizard-bottom-height', `${Math.ceil(bottomBar.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(syncBottomBarHeight);
    observer.observe(bottomBar);
    syncBottomBarHeight();
    return () => observer.disconnect();
  }, [consoleView, currentStep]);

  useEffect(() => {
    if (consoleView !== 'task') return;
    const tabs = wizardTabsRef.current;
    if (!tabs) return;
    const centerCurrentStep = () => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      const active = tabs.querySelector<HTMLElement>('.studio-tab.active');
      if (!active) return;
      const nextLeft = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
      tabs.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' });
    };
    centerCurrentStep();
    window.addEventListener('resize', centerCurrentStep);
    return () => window.removeEventListener('resize', centerCurrentStep);
  }, [consoleView, currentStep]);

  useEffect(() => {
    const routeView = consoleViewFromPathname(pathname || '');
    if (routeView) {
      setConsoleView(routeView);
      return;
    }
    const requestedView = new URLSearchParams(window.location.search).get('view') as ConsoleView | null;
    if (requestedView && ['task', 'knowledge', 'models'].includes(requestedView)) setConsoleView(requestedView);
  }, [pathname]);

  useEffect(() => {
    setHistoryRecords(readHistoryRecords());
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('configure') === '1') {
      setModelDialogOpen(true);
      setNotice('请补全历史模型的 API Key 并测试连接；完成后从左侧返回诊断任务即可继续 Step 2。');
    }
    const workspace = readWorkspace();
    if (!workspace) { setHydrated(true); return; }
    setUrl(workspace.url || '');
    setDraftId(workspace.draftId || '');
    setComparisonBaseline(workspace.comparisonBaseline);
    setGoal(workspace.goal || '注册/试用');
    setDevice(workspace.device || '桌面端');
    setAudience(workspace.audience || '2B');
    setBrandColor(workspace.brandColor || '#0A9C8A');
    setBrandTone(workspace.brandTone || '科技、可信、克制');
    setPrimaryCta(workspace.primaryCta || '');
    setNotes(workspace.notes || '');
    setPageBaseline(workspace.pageBaseline);
    setBehavior(workspace.behavior);
    const restoredHeatmapDataUrl = workspace.heatmapDataUrl || '';
    const restoredHeatmapPreviewUrl = workspace.heatmapPreviewUrl || readHeatmapPreviewCache() || restoredHeatmapDataUrl;
    setHeatmapName(workspace.heatmapName || '');
    setHeatmapPreviewUrl(restoredHeatmapPreviewUrl);
    setHeatmapDataUrl(restoredHeatmapDataUrl);
    setHeatmapUrl(restoredHeatmapPreviewUrl);
    setIncludeHeatmapInModel(Boolean(workspace.includeHeatmapInModel));
    setMarkedCtas(workspace.markedCtas || []);
    setModels((workspace.models || []).map((model) => ({ ...model, protocol: isProviderProtocol(model.protocol) ? model.protocol : 'responses' })));
    setLocal(workspace.local);
    setResults(workspace.results || []);
    setModelProgress((workspace.results || []).map((item) => ({ modelId: item.modelId, modelName: item.modelName, status: item.status, latencyMs: item.latencyMs, error: item.error })));
    setSelectedModelId(workspace.selectedModelId || '');
    setPageDesign(workspace.selectedPageDesign);
    setUiPrompt(workspace.uiPrompt || DEFAULT_UI_PROMPT);
    setHtmlDesigns(workspace.htmlDesigns || []);
    setSelectedHtmlModelIds(workspace.selectedHtmlModelIds || []);
    setActiveHtmlModelId(workspace.activeHtmlModelId || '');
    const restoredHtmlJobs = (workspace.htmlJobs || []).map((job) => {
      const restoredResult = (workspace.htmlDesigns || []).find((item) => item.modelId === job.modelId && item.status === 'success' && item.output?.html);
      if (restoredResult) return { ...job, jobId: job.jobId || safeId(), attempts: job.attempts || 1, status: 'success' as const, html: restoredResult.output?.html, error: undefined, finishedAt: job.finishedAt || new Date().toISOString() };
      const normalizedStatus = job.status === 'success' || job.status === 'failed' || job.status === 'timeout' || job.status === 'cancelled' ? job.status : 'failed';
      if (normalizedStatus !== 'failed' || job.status === 'failed') return { ...job, jobId: job.jobId || safeId(), attempts: job.attempts || 1, status: normalizedStatus };
      const model = (workspace.models || []).find((item) => item.id === job.modelId);
      const staleMessage = '页面刷新后原 HTML 请求已失效，未收到结果，请在第 3 步重新测试该模型。';
      return { ...job, jobId: job.jobId || safeId(), attempts: job.attempts || 1, status: 'failed' as const, finishedAt: new Date().toISOString(), error: { provider: model?.name || job.modelName || '模型服务商', reason: 'UNKNOWN' as const, message: staleMessage, raw: staleMessage, retryable: true, occurredAt: new Date().toISOString() } };
    });
    setHtmlJobs(restoredHtmlJobs);
    setHeatmapCoordinates(workspace.heatmapCoordinates || {});
    setAfterBehavior(workspace.afterBehavior);
    setEvidenceConfirmed(Boolean(workspace.evidenceConfirmed || workspace.local || workspace.selectedPageDesign || workspace.htmlDesigns?.length || workspace.afterBehavior || (workspace.results?.length || 0) > 0));
    // Remove state written by the retired local demo pipeline while retaining imported evidence.
    const legacyDemoIds = new Set(['demo-structure', 'demo-conversion']);
    const legacyDemoMode = Boolean((workspace as PersistedWorkspace & { demoMode?: boolean }).demoMode)
      || (workspace.results || []).some((item) => legacyDemoIds.has(item.modelId))
      || (workspace.htmlDesigns || []).some((item) => legacyDemoIds.has(item.modelId));
    if (legacyDemoMode) {
      setLocal(undefined);
      setResults([]);
      setModelProgress([]);
      setSelectedModelId('');
      setPageDesign(undefined);
      setHtmlDesigns([]);
      setSelectedHtmlModelIds([]);
      setActiveHtmlModelId('');
      setHtmlJobs([]);
      setEvidenceConfirmed(false);
      setCurrentStep(0);
      setHydrated(true);
      setNotice('旧演示数据已清理，请配置并连接模型后继续。');
      return;
    }
    const hasRestoredDesign = Boolean(workspace.selectedPageDesign || workspace.htmlDesigns?.some((item) => item.status === 'success' && item.output?.html));
    const restoredFallback = workspace.afterBehavior ? 3 : hasRestoredDesign ? 2 : workspace.evidenceConfirmed || workspace.local ? 1 : 0;
    const restoredMax = hasRestoredDesign ? 3 : workspace.evidenceConfirmed || workspace.local ? 1 : 0;
    setCurrentStep(Math.min(workspace.currentStep ?? restoredFallback, restoredMax) as WizardStepIndex);
    setHydrated(true);
    setNotice(workspace.selectedModelId ? `已从浏览器恢复 ${workspace.selectedModelId} 的输出。` : '已从浏览器恢复上次工作区。');
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const result = writeHistoryRecords(historyRecords);
      if (result?.degraded) {
        setNotice('分析已完成；历史快照因浏览器存储空间有限已压缩保存，当前工作区仍保留完整结果。');
      }
    } catch (reason) {
      if (isHistoryQuotaError(reason)) {
        setNotice('分析已完成，但历史快照因浏览器存储空间不足未能完整保存。请清理历史记录后再试；当前工作区仍可继续使用。');
        return;
      }
      setError(errorMessage(reason));
    }
  }, [historyRecords, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    safeWriteWorkspace({
      url,
      draftId,
      comparisonBaseline,
      goal,
      device,
      audience,
      brandColor,
      brandTone,
      primaryCta,
      notes,
      pageBaseline,
      behavior,
      heatmapName,
      heatmapDataUrl,
      heatmapPreviewUrl,
      includeHeatmapInModel,
      markedCtas,
      models,
      local,
      results,
      selectedModelId,
      selectedPageDesign: pageDesign,
      uiPrompt,
      htmlDesigns,
      selectedHtmlModelIds,
      activeHtmlModelId,
      htmlJobs,
      heatmapCoordinates,
      afterBehavior,
      evidenceConfirmed,
      currentStep,
    });
  }, [activeHtmlModelId, afterBehavior, audience, behavior, brandColor, brandTone, comparisonBaseline, currentStep, device, draftId, evidenceConfirmed, goal, heatmapCoordinates, heatmapDataUrl, heatmapName, heatmapPreviewUrl, htmlDesigns, htmlJobs, hydrated, includeHeatmapInModel, local, markedCtas, models, notes, pageBaseline, pageDesign, primaryCta, results, selectedHtmlModelIds, selectedModelId, uiPrompt, url]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice((current) => current === notice ? '' : current), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  function resetAnalysis(preserveReview = false) { setLocal(undefined); setResults([]); setModelProgress([]); setSelectedModelId(''); setPageDesign(undefined); setHtmlDesigns([]); setHtmlJobs([]); setSelectedHtmlModelIds([]); setActiveHtmlModelId(''); if (!preserveReview) setAfterBehavior(undefined); }
  function resetCurrentDiagnosis() {
    if (heatmapUrl.startsWith('blob:')) URL.revokeObjectURL(heatmapUrl);
    setDraftId(''); setComparisonBaseline(undefined); setHistoryId(''); setUrl(''); setGoal('注册/试用'); setDevice('桌面端'); setAudience('2B'); setBrandColor('#0A9C8A'); setBrandTone('科技、可信、克制'); setPrimaryCta(''); setNotes(''); setPageBaseline(undefined); setBaselineError(''); setBehavior(undefined); setHeatmapName(''); setHeatmapUrl(''); setHeatmapPreviewUrl(''); setHeatmapDataUrl(''); setIncludeHeatmapInModel(true); setMarkedCtas([]); setHeatmapCoordinates({}); setUiPrompt(DEFAULT_UI_PROMPT); setEvidenceConfirmed(false); resetAnalysis(); setCurrentStep(0); setError(''); setNotice('当前诊断已重置；模型配置、知识库和历史记录均已保留。');
  }
  function requestStep(step: WizardStepIndex) {
    setConsoleView('task');
    const highestAccessibleStep: WizardStepIndex = displayedDesign || hasHtmlDesign ? 3 : evidenceConfirmed || local ? 1 : 0;
    if (step > highestAccessibleStep) {
      nudgeMobile('请先完成前序步骤。');
      return;
    }
    setCurrentStep(step);
    if (step < currentStep) nudgeMobile('已返回上一步，已有分析与生成结果继续保留。');
  }
  function jumpTo(id: string) {
    const step = wizardStepIds.indexOf(id as typeof wizardStepIds[number]);
    if (step >= 0) requestStep(step as WizardStepIndex);
  }
  function updateHistory(status: HistoryStatus, id = historyId || safeId(), overrides: HistorySnapshotOverrides = {}) {
    const now = new Date().toISOString();
    const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || '未命名页面'; } })();
    const localOutput = 'localOutput' in overrides ? overrides.localOutput : local;
    const modelOutputs = 'modelOutputs' in overrides ? overrides.modelOutputs || [] : results;
    const pageDesignSnapshot = 'pageDesign' in overrides ? overrides.pageDesign : pageDesign;
    const htmlDesignSnapshot = 'htmlDesigns' in overrides ? overrides.htmlDesigns || [] : htmlDesigns;
    const activeHtmlSnapshot = 'activeHtmlModelId' in overrides ? overrides.activeHtmlModelId || '' : activeHtmlModelId;
    const evidenceRefs: EvidenceRef[] = [
      ...(url ? [{ id: 'page-url', kind: 'url' as const, label: '页面 URL', detail: url }] : []),
      ...(heatmapName ? [{ id: 'heatmap-image', kind: 'heatmap' as const, label: '热力图截图', detail: heatmapName }] : []),
      ...(behavior ? [{ id: 'behavior-data', kind: 'behavior' as const, label: 'Web 点击数据', detail: `${behavior.sourceName} · ${behavior.range} · ${behavior.elements.length} 个元素` }] : []),
      ...Object.entries(heatmapCoordinates).map(([elementId, detail]) => ({ id: `coordinate-${elementId}`, kind: 'coordinate' as const, label: '热力图坐标', detail })),
    ];
    const inputSnapshot = {
      url, goal, device, audience, brandColor, brandTone, primaryCta, notes, pageBaseline, behavior,
      heatmapName, heatmapDataUrl: heatmapDataUrl || undefined, includeHeatmapInModel, markedCtas,
      heatmapCoordinates,
    };
    const withoutChecksum: Omit<HistoryRecord, 'diagnosisChecksum'> = {
      id,
      inputSnapshot,
      modelConfigSnapshot: structuredClone(models).map(({ apiKey: _apiKey, ...config }) => config),
      localOutput,
      modelOutputs,
      adoptedBlueprint: pageDesignSnapshot || htmlDesignSnapshot.length ? { pageDesign: pageDesignSnapshot, htmlDesigns: htmlDesignSnapshot, activeHtmlModelId: activeHtmlSnapshot, uiPrompt } : undefined,
      evidenceRefs,
      meta: { name: pageBaseline?.pageTitle || hostname, goal, createdAt: historyRecords.find((item) => item.id === id)?.meta.createdAt || now, snapshotAt: now, status, modelCount: modelOutputs.length, stage: overrides.stage || Math.max(1, currentStep + 1) as 1 | 2 | 3 | 4 },
    };
    const candidate = withDiagnosisChecksum(withoutChecksum);
    const previous = historyRecords.find((item) => item.id === id);
    const recordId = previous && isFrozenHistoryRecord(previous) && previous.diagnosisChecksum !== candidate.diagnosisChecksum ? safeId() : id;
    const nextRecord = { ...candidate, id: recordId };
    setHistoryId(recordId);
    setHistoryRecords((items) => [{ ...nextRecord }, ...items.filter((item) => item.id !== recordId)].slice(0, 50));
    return recordId;
  }
  async function importBehavior(event: ChangeEvent<HTMLInputElement>, after = false) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = await parseBehaviorFile(file); if (after) { setAfterBehavior(parsed); setNotice('已导入改版后行为数据。'); } else { setDraftId(''); setComparisonBaseline(undefined); setEvidenceConfirmed(false); setBehavior(parsed); setMarkedCtas(parsed.elements.filter((item) => /注册|试用|体验|购买|咨询|开通|订阅/i.test(item.name)).slice(0, 1).map((item) => item.id)); setHeatmapCoordinates({}); resetAnalysis(); setCurrentStep(0); setNotice('已上传 Web 事件点击数据。'); } setError(''); } catch (reason) { setError(errorMessage(reason)); }
  }
  async function importHeatmap(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) { setError('热力图需为 PNG、JPG、WEBP 等图片文件。'); return; } if (heatmapUrl.startsWith('blob:')) URL.revokeObjectURL(heatmapUrl); const [dataUrl, previewUrl] = await Promise.all([compactHeatmapForModel(file), compactHeatmapForPreview(file)]); setDraftId(''); setComparisonBaseline(undefined); setEvidenceConfirmed(false); resetAnalysis(); setHeatmapCoordinates({}); setCurrentStep(0); setHeatmapName(file.name); setHeatmapPreviewUrl(previewUrl || dataUrl || ''); setHeatmapUrl(previewUrl || dataUrl || URL.createObjectURL(file)); setHeatmapDataUrl(dataUrl || ''); setError(''); setNotice('已上传热力图截图。'); }
  function clearHeatmap() {
    if (heatmapUrl.startsWith('blob:')) URL.revokeObjectURL(heatmapUrl);
    setDraftId(''); setComparisonBaseline(undefined); setEvidenceConfirmed(false); setHeatmapName(''); setHeatmapUrl(''); setHeatmapPreviewUrl(''); setHeatmapDataUrl(''); setIncludeHeatmapInModel(true); setHeatmapCoordinates({}); resetAnalysis(); setCurrentStep(0); setNotice('已删除热力图及其坐标和生成结果。');
  }
  function clearBehavior(after = false) {
    if (after) { setAfterBehavior(undefined); setNotice('已删除改版后行为数据。'); return; }
    setDraftId(''); setComparisonBaseline(undefined); setEvidenceConfirmed(false); setBehavior(undefined); setMarkedCtas([]); setHeatmapCoordinates({}); resetAnalysis(); setCurrentStep(0); setNotice('已删除网页行为数据及相关分析结果。');
  }
  async function loadDemoCase(caseId: typeof demoEntries[number]['id']) {
    setDemoLoadingId(caseId); setError(''); setBaselineError('');
    try {
      const { loadDemoCase: getDemoCase } = await import('../../lib/demoCases');
      const demo = await getDemoCase(caseId);
      if (heatmapUrl.startsWith('blob:')) URL.revokeObjectURL(heatmapUrl);
      setDraftId(''); setComparisonBaseline(undefined); setEvidenceConfirmed(false); setUrl(demo.url); setGoal(demo.goal); setDevice(demo.device); setAudience(caseId === 'activity' ? '2C' : '2B'); setBrandColor(caseId === 'activity' ? '#F07A52' : caseId === 'plan' ? '#4C8DFF' : '#0A9C8A'); setBrandTone(caseId === 'activity' ? '明快、直接、有时效感' : '科技、可信、克制'); setPrimaryCta(demo.primaryCta); setNotes(demo.notes); setPageBaseline(demo.baseline); setBehavior(demo.behavior); setMarkedCtas(demo.markedCtaIds); setHeatmapName(demo.heatmapName); setHeatmapPreviewUrl(demo.heatmapUrl); setHeatmapUrl(demo.heatmapUrl); setHeatmapDataUrl(''); setIncludeHeatmapInModel(false); setHeatmapCoordinates({}); resetAnalysis(); setCurrentStep(0); setNotice(`${demo.name} 演示案例已导入，请配置并连接模型后继续。`);
    } catch (reason) { setError(errorMessage(reason)); } finally { setDemoLoadingId(''); }
  }
  async function fetchPageBaseline() {
    if (!url) { setBaselineError('请先填写页面 URL。'); return; }
    setBaselineLoading(true); setBaselineError('');
    try {
      const response = await fetch('/api/page-baseline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `页面结构抓取失败 (${response.status})`);
      setPageBaseline(body.baseline as PageBaseline);
      setNotice('已抓取页面结构。后续分析和预览会优先参考原页面的标题、导航和区块信息。');
    } catch (reason) { setBaselineError(errorMessage(reason)); } finally { setBaselineLoading(false); }
  }
  function toggleCta(item: ElementRecord) { setMarkedCtas((items) => items.includes(item.id) ? items.filter((id) => id !== item.id) : [...items, item.id]); }
  function validateModel(model: Pick<ModelConfig, 'name' | 'baseUrl' | 'model' | 'apiKey'>) { if (!model.name || !model.baseUrl || !model.model || !model.apiKey) return '请填写模型名称、Base URL、模型 ID 和 API Key。'; try { new URL(model.baseUrl); } catch { return 'Base URL 格式不正确。'; } return ''; }
  function addModel(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const validation = validateModel(modelDraft); if (validation) { setModelError(validation); return; } setModels((items) => [...items, { ...modelDraft, id: safeId(), enabled: true, connectionStatus: 'untested' }]); setModelDraft({ name: '', baseUrl: 'https://api.openai.com/v1', model: '', protocol: 'responses', apiKey: '', reasoningEffort: 'medium', timeoutSeconds: 180 }); setShowModelForm(false); setNotice('模型已添加。请先测试连接，测试成功后才能使用该模型分析。'); setModelError(''); }
  function saveModelEdit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editingModel) return; const validation = validateModel(editingModel); if (validation) { setModelError(validation); return; } setModels((items) => items.map((item) => item.id === editingModel.id ? { ...editingModel, connectionStatus: 'untested', connectionError: undefined, connectionLatencyMs: undefined } : item)); setEditingModel(undefined); setNotice('模型配置已更新。请重新测试连接后再分析。'); setModelError(''); }
  async function checkModelConnection(model: ModelConfig) { const validation = validateModel(model); if (validation) { setModelError(validation); return; } setModels((items) => items.map((item) => item.id === model.id ? { ...item, connectionStatus: 'testing', connectionError: undefined, connectionLatencyMs: undefined } : item)); setModelError(''); try { const result = await testModelConnection(model); setModels((items) => items.map((item) => item.id === model.id ? { ...item, connectionStatus: 'success', connectionLatencyMs: result.latencyMs } : item)); setNotice(`${model.name} 连接成功，${result.latencyMs}ms。现在可以用于分析。`); } catch (reason) { const message = errorMessage(reason); setModels((items) => items.map((item) => item.id === model.id ? { ...item, connectionStatus: 'failed', connectionError: message } : item)); setNotice(''); } }
  async function analyze() {
    if (!evidence) { setError('请先填写页面 URL 并导入行为数据。'); return; }
    const taskId = updateHistory('running', historyId || safeId(), { stage: 2 });
    setRunning(true); setError(''); resetAnalysis(); setModelProgress(availableModels.map((model) => ({ modelId: model.id, modelName: model.name, protocol: model.protocol, status: 'queued' as const }))); setNotice('模型分析已启动：先运行本地规则引擎。');
    try {
      const knowledgeContext = readKnowledgeLibrary().entries.filter((entry) => entry.enabled).map(({ id, category, severity, title, principle, evidence, action, validation, guardrail, tags, enabled }) => ({ id, category, severity, title, principle, evidence, action, validation, guardrail, tags, enabled }));
      const localResult = await runLocalAnalysis(evidence, knowledgeContext);
      setLocal(localResult);
      setNotice(availableModels.length ? `本地规则已完成，开始调用 ${availableModels.length} 个模型。` : '本地规则已完成；配置并连接至少一个模型后才能创建 HTML 生成任务。');
      const modelResults = availableModels.length ? await runModelAnalysis(
        evidence,
        availableModels,
        localResult,
        (progress) => setModelProgress((items) => items.map((item) => item.modelId === progress.modelId ? { ...item, ...progress } : item)),
        (result) => {
          setResults((items) => {
            const next = [...items.filter((item) => item.modelId !== result.modelId), result];
            return next;
          });
          if (result.status === 'success') {
            setSelectedHtmlModelIds((items) => items.includes(result.modelId) ? items : [...items, result.modelId]);
            setSelectedModelId((current) => current || result.modelId);
          }
        },
        knowledgeContext,
      ) : [];
      const failed = modelResults.filter((item) => item.status === 'failed');
      updateHistory('pending_review', taskId, { localOutput: localResult, modelOutputs: modelResults, stage: 2 });
      setNotice(availableModels.length ? failed.length ? `本地规则与 ${modelResults.length - failed.length} 个模型已完成，${failed.length} 个模型失败。请确认勾选项并检查合成 Prompt。` : `本地规则与 ${modelResults.length} 个模型均已完成。请确认勾选项并检查合成 Prompt。` : '本地规则已完成；配置并连接至少一个模型后才能创建 HTML 生成任务。');
    } catch (reason) { updateHistory('pending_review', taskId, { stage: 2 }); setError(errorMessage(reason)); } finally { setRunning(false); }
  }
  async function generateDesign(result: ModelResult) {
    if (!evidence || !local || result.status !== 'success') return;
    const model = models.find((item) => item.id === result.modelId);
    if (!model) return;
    setGeneratingModelId(result.modelId);
    setError('');
    try {
      const generated = await runModelPageDesign(evidence, local, result, model);
      if (generated.status !== 'success' || !generated.output?.design) throw new Error(formatProviderError(generated.error, '模型未返回可用页面设计。'));
      const design = { ...generated.output.design, sourceModel: result.modelName, sourceModelId: result.modelId };
      setSelectedModelId(result.modelId);
      setPageDesign(design);
      updateHistory('completed', historyId || safeId(), { pageDesign: design, stage: 3 });
      setNotice(`已使用 ${result.modelName} 生成新版页面。此设计会保存在浏览器里。`);
      setCurrentStep(2);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setGeneratingModelId('');
    }
  }
  function clearHtmlOutputs() { setPageDesign(undefined); setHtmlDesigns([]); setHtmlJobs([]); setActiveHtmlModelId(''); setAfterBehavior(undefined); }
  function toggleHtmlModel(id: string) {
    clearHtmlOutputs();
    setSelectedHtmlModelIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }
  function changeUiPrompt(value: string) { clearHtmlOutputs(); setUiPrompt(value); }
  function changeVisualInput(value: boolean) { clearHtmlOutputs(); setIncludeHeatmapInModel(value); }
  function changeHeatmapCoordinate(id: string, value: string) {
    clearHtmlOutputs();
    setHeatmapCoordinates((items) => {
      const next = { ...items };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }
  async function generateHtmlDesigns() {
    if (!evidence || !local) { setError('请先完成本次页面分析，再生成改版 UI。'); return; }
    const selectedModels = selectedGenerationModels;
    if (!selectedModels.length) { setError('请至少勾选一个已连接成功的模型。'); return; }
    const existingJobs = htmlJobs.filter((job) => selectedModels.some((model) => model.id === job.modelId));
    const existingByModel = new Map(existingJobs.map((job) => [job.modelId, job]));
    const retryTargets = existingJobs.some((job) => job.status === 'success')
      ? selectedModels.filter((model) => existingByModel.get(model.id)?.status !== 'success')
      : selectedModels;
    const dispatchModels = retryTargets.length ? retryTargets : selectedModels;
    const queuedJobs = dispatchModels.map((model) => ({ jobId: safeId(), modelId: model.id, modelName: model.name, status: 'queued' as const, attempts: (existingByModel.get(model.id)?.attempts || 0) + 1, startedAt: undefined, finishedAt: undefined }));
    setHtmlJobs((items) => [...items.filter((job) => !dispatchModels.some((model) => model.id === job.modelId)), ...queuedJobs]);
    setHtmlDesigns((items) => items.filter((item) => !dispatchModels.some((model) => model.id === item.modelId)));
    setHtmlGenerating(true);
    setError('');
    setNotice(`已创建 ${dispatchModels.length} 个独立 HTML 生成任务。`);
    try {
      const generated = await Promise.all(dispatchModels.map(async (model) => {
        const startedAt = new Date().toISOString();
        setHtmlJobs((items) => items.map((job) => job.modelId === model.id ? { ...job, status: 'running', startedAt } : job));
        let result: HtmlDesignResult;
        try {
          result = await runModelHtmlDesign(evidence, composedPrompt, model, results.find((item) => item.modelId === model.id));
        } catch (reason) {
          result = { modelId: model.id, modelName: model.name, status: 'failed', latencyMs: 0, error: clientProviderError(model, reason) };
        }
        setHtmlJobs((items) => items.map((job) => job.modelId === model.id ? { ...job, status: htmlJobStatus(result), error: result.error, html: result.output?.html, finishedAt: new Date().toISOString() } : job));
        setHtmlDesigns((items) => [...items.filter((item) => item.modelId !== model.id), result]);
        return result;
      }));
      const merged = [...htmlDesigns.filter((item) => !generated.some((candidate) => candidate.modelId === item.modelId)), ...generated];
      const success = merged.filter((item) => item.status === 'success' && item.output?.html);
      if (success.length) {
        setActiveHtmlModelId((current) => current || success[0].modelId);
        setSelectedModelId(success[0].modelId);
        updateHistory('completed', historyId || safeId(), { htmlDesigns: merged, activeHtmlModelId: success[0].modelId, stage: 3 });
        const failedCount = merged.filter((item) => item.status === 'failed').length;
        setNotice(`${success.length} 个独立 HTML 页面已完成${failedCount ? `，${failedCount} 个失败任务可在第 3 步查看并单独重试` : ''}。第 3 步已解锁。`);
      } else {
        setNotice('本轮没有模型返回可用 HTML。请检查模型配置后重新生成。');
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setHtmlGenerating(false);
    }
  }
  async function retryHtmlJob(jobId: string) {
    if (!evidence || !local || retryingJobId) return;
    const job = htmlJobs.find((item) => item.jobId === jobId);
    const model = job ? analysisModels.find((item) => item.id === job.modelId) : undefined;
    if (!job || !model || !job.error || !providerErrorRetryable(job.error)) return;
    setRetryingJobId(jobId);
    setHtmlJobs((items) => items.map((item) => item.jobId === jobId ? { ...item, status: 'running', attempts: item.attempts + 1, startedAt: new Date().toISOString(), finishedAt: undefined } : item));
    try {
      let result: HtmlDesignResult;
      try {
        result = await runModelHtmlDesign(evidence, composedPrompt, model, results.find((item) => item.modelId === model.id));
      } catch (reason) {
        result = { modelId: model.id, modelName: model.name, status: 'failed', latencyMs: 0, error: clientProviderError(model, reason) };
      }
      const success = htmlJobStatus(result) === 'success';
      setHtmlJobs((items) => items.map((item) => item.jobId === jobId ? { ...item, status: htmlJobStatus(result), error: result.error, html: result.output?.html, finishedAt: new Date().toISOString() } : item));
      setHtmlDesigns((items) => [...items.filter((item) => item.modelId !== model.id), result]);
      if (success) {
        setActiveHtmlModelId(model.id);
        setSelectedModelId(model.id);
        setNotice(`${model.name} 已重新测试成功，返回的 HTML 已更新。`);
      } else {
        setNotice(`${model.name} 重新测试仍未返回可用 HTML，请查看错误原因。`);
      }
    } finally {
      setRetryingJobId('');
    }
  }
  function exportReport() { if (!evidence || !local || !displayedDesign) return; download(`heatscope-${new URL(evidence.url).hostname}-${new Date().toISOString().slice(0, 10)}.md`, resultMarkdown(evidence, local, displayedDesign, results)); }
  function exportActiveHtml() {
    const active = htmlDesigns.find((item) => item.modelId === activeHtmlModelId) || htmlDesigns.find((item) => item.status === 'success');
    if (!active?.output?.html || !evidence) return;
    download(`heatscope-${new URL(evidence.url).hostname}-${active.modelName.replace(/[^\w\-\u4e00-\u9fff]+/g, '-')}.html`, active.output.html, 'text/html;charset=utf-8');
  }
  function proceedFromEvidence() {
    if (!requiredEvidenceReady) { setError('请先补齐 URL、热力图、点击数据、核心 CTA、受众和品牌变量。'); nudgeMobile('当前证据未完成，请先补齐必填项。'); return; }
    setEvidenceConfirmed(true);
    setConsoleView('task');
    setCurrentStep(1);
    setError('');
    setNotice('');
  }

  function nudgeMobile(message: string) {
    setMobileToast(message);
    setMobileActionPulse(true);
    window.setTimeout(() => setMobileActionPulse(false), 360);
    window.setTimeout(() => setMobileToast(''), 2600);
  }

  function previousStep() { if (currentStep > 0) requestStep((currentStep - 1) as WizardStepIndex); }

  function nextStep() {
    if (currentStep === 0) { proceedFromEvidence(); return; }
    if (currentStep === 1) {
      if (!local) { nudgeMobile('请先启动模型分析。'); return; }
      if (!selectedHtmlModelIds.length) { nudgeMobile('请至少勾选一个模型参与 UI 生成。'); return; }
      if (!selectedJobsComplete) { nudgeMobile(allHtmlJobsFailed ? '本轮模型都未返回 HTML，请先重新生成。' : '请先创建生成 Jobs，并等待至少一个模型成功返回 HTML。'); return; }
      setCurrentStep(2);
      setNotice(hasInFlightHtmlJobs ? '已有模型成功返回 HTML，进入 UI 结果；仍在运行的任务会继续更新。' : '已有可用 HTML，进入 UI 结果对比。');
      return;
    }
    if (currentStep === 2) {
      if (!displayedDesign && !hasHtmlDesign) { nudgeMobile('当前没有可预览的新版页面。'); return; }
      setCurrentStep(3);
      setNotice('进入改版后数据复盘。');
      return;
    }
    if (!afterBehavior) { nudgeMobile('请先上传改版后的行为数据，再完成复盘。'); return; }
    updateHistory('completed', historyId || safeId(), { stage: 4 });
    setNotice('复盘已保存到当前工作区。');
  }

  return <>
    <main className={`tool-shell workbench-shell console-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#workspace">跳到工作区</a>
      <ConsoleTopbar onMenu={() => setMobileNavOpen(true)} onExport={local ? exportReport : undefined} />

      <ConsoleSidebar active={consoleView} onChange={(view) => router.push(consoleRouteByView[view])} historyCount={historyRecords.length} modelCount={models.length} mobileOpen={mobileNavOpen} collapsed={sidebarCollapsed} onClose={() => setMobileNavOpen(false)} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} />
      <section className="console-main">
      <div className="console-content">
      {consoleView === 'task' && <div className="wizard-layout console-task-view">
        <section className="studio-shell wizard-shell">
          <div ref={wizardHeaderRef} className="studio-header wizard-header">
            <div ref={wizardTabsRef} className="studio-tabs" aria-label="当前工作流" style={{ '--wizard-progress': `${workflowItems.length > 1 ? (currentStep / (workflowItems.length - 1)) * 100 : 0}%` } as CSSProperties}>
              {workflowItems.map((item, index) => {
                const state = index < currentStep ? 'complete' : index === currentStep ? 'active' : 'locked';
                return <button type="button" className={`studio-tab ${state}`} data-step-state={state} onClick={() => requestStep(index as WizardStepIndex)} aria-current={state === 'active' ? 'step' : undefined} title={state === 'locked' ? '请先完成前序步骤' : state === 'complete' ? '返回编辑并重置后续步骤' : '当前步骤'} key={item.id}>
                <b data-step={String(index + 1).padStart(2, '0')}>{state === 'locked' ? <LockKeyhole size={13} /> : state === 'complete' ? <CheckmarkFilled className="wizard-complete-icon" size={24} /> : String(index + 1).padStart(2, '0')}</b>
                <span><strong>{item.label}</strong><small>{state === 'complete' ? `已完成 · ${item.hint}` : item.hint}</small></span>
              </button>})}
            </div>
            <div className="studio-status">
              <strong className="mobile-step-title">{workflowItems.find((item) => item.id === currentPanel)?.label}</strong>
              <b>{sessionLabel}</b>
              {comparisonBaseline && <span className="draft-baseline-note">对比基线：{comparisonBaseline.name}</span>}
              <span>{currentStep === 0 ? '完成证据门禁后解锁模型分析' : currentStep === 1 ? selectedJobsComplete ? (hasInFlightHtmlJobs ? '已有 HTML 可查看，其他任务仍在生成' : failedHtmlJobs.length ? `已有 HTML 可查看，${failedHtmlJobs.length} 个失败项待在第 3 步处理` : '已有 HTML 可查看，可进入 UI 结果') : local ? '本地已完成，等待模型逐个返回' : running ? '先运行本地规则，再调用模型' : '等待开始分析' : currentStep === 2 ? '比较独立 HTML 与优化点后进入复盘' : '上传改版后同口径数据'}</span>
            </div>
          </div>

          <main id="workspace" className="studio-canvas solo-canvas">
            <div className="canvas-scroll solo-scroll">
              {notice && <div className="inline-banner success"><CircleCheck size={15} /><span>{notice}</span></div>}
              {error && <div className="inline-banner error"><CircleAlert size={15} /><span>{error}</span></div>}

              {currentPanel === 'input' && <section id="input" className="canvas-panel input-wizard-panel">
                <div className="canvas-header">
                  <div>
                    <span className="canvas-eyebrow">Step 1</span>
                    <h1>先上传页面证据，再进入分析。</h1>
                  </div>
                  <div className="canvas-actions"><button type="button" className="console-button danger diagnosis-reset-button" onClick={resetCurrentDiagnosis}>重置当前诊断</button></div>
                </div>

                <div className="wizard-card intro-card">
                  <div>
                    <b>当前要求</b>
                  </div>
                  <div className="wizard-checks">
                    <span className={url.trim() ? 'ready' : ''}>{url.trim() ? '已填写 URL' : '待填写 URL'}</span>
                    <span className={heatmapName ? 'ready' : ''}>{heatmapName ? '已上传热力图' : '待上传热力图'}</span>
                    <span className={behavior ? 'ready' : ''}>{behavior ? '已上传点击数据' : '待上传点击数据'}</span>
                    <span className={primaryCta.trim() ? 'ready' : ''}>{primaryCta.trim() ? '已填写核心 CTA' : '待填写核心 CTA'}</span>
                    <span className={brandColor && brandTone.trim() ? 'ready' : ''}>{brandColor && brandTone.trim() ? '品牌变量已填' : '待填写品牌变量'}</span>
                  </div>
                </div>

                <div className="input-board wizard-input-board">
                  <div className="form-grid">
                    <label>分析页面 URL<input value={url} onChange={(event) => { setEvidenceConfirmed(false); setHistoryId(''); setUrl(event.target.value); setPageBaseline(undefined); setBaselineError(''); resetAnalysis(); }} type="url" placeholder="https://example.com/page" /></label>
                    <label>页面目标<select value={goal} onChange={(event) => setGoal(event.target.value as Goal)}>{goals.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label>设备类型<select value={device} onChange={(event) => setDevice(event.target.value)}><option>桌面端</option><option>移动端</option></select></label>
                    <label>核心业务 CTA（必填）<input value={primaryCta} onChange={(event) => setPrimaryCta(event.target.value)} placeholder="例如：免费获取 API Key" /></label>
                    <label>受众类型<select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}><option value="2B">2B 企业</option><option value="2C">2C 消费</option><option value="2G">2G 政务</option></select></label>
                    <label>品牌主色（HEX）<span className="brand-color-input"><input aria-label="品牌主色选择器" type="color" value={/^#[0-9A-Fa-f]{6}$/.test(brandColor) ? brandColor : '#0A9C8A'} onChange={(event) => setBrandColor(event.target.value.toUpperCase())} /><input aria-label="品牌主色 HEX" value={brandColor} onChange={(event) => setBrandColor(event.target.value.toUpperCase())} placeholder="#0A9C8A" /></span></label>
                    <label>品牌调性 <em className="field-optional">必填</em><input value={brandTone} onChange={(event) => setBrandTone(event.target.value)} placeholder="例如：科技、可信、克制" /></label>
                  </div>

                  <div className="uploads wizard-uploads">
                    <UploadField label="上传热力图截图" accept="image/png,image/jpeg,image/webp" onChange={importHeatmap} onClear={clearHeatmap} fileName={heatmapName} description="PNG / JPG / WEBP，用于空间位置复核" />
                    <UploadField label="上传网页行为数据" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importBehavior} onClear={() => clearBehavior(false)} fileName={behavior?.sourceName} description="CSV / XLSX，至少含元素名称和点击次数" />
                  </div>

                  {behavior && <div className="data-summary">
                    <div><b>{number.format(behavior.clicks)}</b><span>已导入点击</span></div>
                    <div><b>{behavior.elements.length}</b><span>有效元素</span></div>
                    <div><b>{behavior.pagePv ? number.format(behavior.pagePv) : '未提供'}</b><span>页面 PV</span></div>
                    <div><b>{behavior.range}</b><span>数据时间</span></div>
                  </div>}
                  {behavior?.warnings.map((warning) => <p className="data-warning" key={warning}>{warning}</p>)}

                  <label className="full">页面背景说明 <em className="field-optional">可选</em><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：当前为投放落地页；本批数据为改版前 7 天；目标是注册后创建 API Key。" /></label>

                  <div className="wizard-actions">
                    <button type="button" className="model-link" onClick={() => { setModelDialogOpen(true); setModelError(''); }}>配置模型服务</button>
                    <button type="button" className="composer-primary" onClick={proceedFromEvidence} disabled={!requiredEvidenceReady}>确认证据并继续</button>
                  </div>
                </div>

                <section className="demo-grid wizard-demo-grid">
                  {demoEntries.map((item) => <article className="demo-card" key={item.id}>
                    <div><span>{item.goal}</span><h3>{item.name}</h3><p>{item.summary} · {item.heatmap}</p></div>
                    <button type="button" className="model-link demo-load" onClick={() => loadDemoCase(item.id)} disabled={demoLoadingId === item.id}>{demoLoadingId === item.id ? '导入中' : '导入演示案例'}</button>
                  </article>)}
                </section>
              </section>}

              {currentPanel === 'analysis' && <section id="analysis" className="canvas-panel">
                  <div className="canvas-header">
                    <div>
                      <span className="canvas-eyebrow">Step 2</span>
                      <h2>先比对不同模型的分析，再选择模型生成页面</h2>
                    </div>
                  </div>

                  <div className="analysis-board console-analysis">
                    <div className="engine-summary">
                      <div><span>已验证模型</span><b>{availableModels.length}</b><small>{hasUnverifiedEnabledModel ? '仍有启用模型需要检测' : availableModels.length ? '本地规则完成后逐个返回' : '可在全局设置中添加模型'}</small></div>
                      <button type="button" className="model-link" onClick={() => { setModelDialogOpen(true); setModelError(''); }}><KeyRound size={15} /> 管理模型服务</button>
                    </div>
                    <div className="analysis-track-grid" aria-label="本地规则先行与各模型分析进度">
                      <article className={local ? 'complete' : running ? 'running' : ''}><span><Settings2 size={15} /> 本地规则</span><b>本地规则引擎</b><small>{local ? `${local.insights.length} 条硬约束已命中` : running ? '分析中' : '待启动'}</small></article>
                      {modelProgress.length ? modelProgress.map((item) => <article key={item.modelId} className={item.status === 'success' ? 'complete' : item.status === 'failed' ? 'failed' : item.status === 'running' ? 'running' : ''}>
                        <span><Sparkles size={15} /> {item.protocol ? protocolLabel(item.protocol) : '模型分析'}</span><b>{item.modelName}</b><small>{item.status === 'queued' ? '排队中' : item.status === 'running' ? '分析中 · 正在等待模型返回' : item.status === 'success' ? `已完成 · ${item.latencyMs || 0}ms` : `调用失败 · ${formatProviderError(item.error, '请检查模型配置')}`}</small>
                      </article>) : <article className={running ? 'running' : ''}><span><Sparkles size={15} /> 轨道 B</span><b>尚未配置已连接模型</b><small>{running ? '本地规则运行中' : '待配置'}</small></article>}
                    </div>
                    {modelProgress.length > 0 && <div className="analysis-progress-summary" aria-live="polite"><span>排队 {modelProgressSummary.queued}</span><span className="is-running">分析中 {modelProgressSummary.running}</span><span className="is-success">完成 {modelProgressSummary.success}</span><span className="is-failed">失败 {modelProgressSummary.failed}</span></div>}
                    {heatmapName && <label className="vision-toggle"><input type="checkbox" checked={includeHeatmapInModel} onChange={(event) => changeVisualInput(event.target.checked)} />将热力图作为模型视觉输入</label>}
                    <div className="analysis-cta">
                      <div><b>{hasUnverifiedEnabledModel ? '请先完成启用模型的连接检测' : availableModels.length ? `将并行比较 ${availableModels.length} 个模型反馈，再选择一个或多个模型生成页面` : '先用本地规则完成分析'}</b></div>
                      <button onClick={analyze} disabled={running || !evidence}>{running ? <><LoaderCircle className="spin" size={16} /> 模型分析中</> : <><Sparkles size={16} /> 开始模型分析</>}</button>
                    </div>
                  </div>
                  <div className="baseline-panel analysis-baseline-panel">
                    <div className="baseline-head">
                      <div><b>页面结构基线 <em className="field-optional">可选</em></b></div>
                      <button type="button" className="model-link" onClick={fetchPageBaseline} disabled={baselineLoading || !url}>{baselineLoading ? '抓取中' : '抓取页面结构'}</button>
                    </div>
                    {pageBaseline
                      ? <div className="baseline-grid">
                        <article><span>站点</span><b>{pageBaseline.siteName}</b><small>{pageBaseline.host}</small></article>
                        <article><span>页面标题</span><b>{pageBaseline.heroTitle || pageBaseline.pageTitle}</b><small>{pageBaseline.source === 'demo' ? '演示基线' : '在线抓取基线'}</small></article>
                        <article><span>导航关键词</span><b>{pageBaseline.navItems.slice(0, 3).join(' / ') || '未识别'}</b><small>{pageBaseline.sections.slice(0, 2).join(' / ') || '未识别主要区块'}</small></article>
                      </div>
                      : <div className="baseline-empty">未抓取</div>}
                    {baselineError && <p className="inline-error baseline-error">{baselineError}</p>}
                  </div>

                  {behavior && <EvidenceWorkbench behavior={behavior} heatmapUrl={heatmapUrl} heatmapName={heatmapName} heatmapCoordinates={heatmapCoordinates} markedCtas={markedCtas} onToggleCta={toggleCta} local={local} results={results} analysisRunning={running} selectedHtmlModelIds={selectedHtmlModelIds} htmlGenerating={htmlGenerating} uiPrompt={uiPrompt} composedPrompt={composedPrompt} htmlJobs={htmlJobs} onSelectModel={setSelectedModelId} onToggleHtmlModel={toggleHtmlModel} onChangeUiPrompt={changeUiPrompt} onGenerateHtml={generateHtmlDesigns} onCoordinateChange={changeHeatmapCoordinate} />}
                </section>}

                {currentPanel === 'output' && <section id="output" className="canvas-panel">
                    <div className="canvas-header">
                    <div><span className="canvas-eyebrow">Step 3</span><h2>模型返回的新版页面</h2><InfoHint label="HTML 结果说明">模型根据热力图、点击数据和你的 Prompt 返回纯前端 HTML；不同模型的页面独立保存。</InfoHint></div>
                    <div className="canvas-actions">{hasHtmlDesign ? <button className="export-button" onClick={exportActiveHtml}><Download size={16} /> 导出当前 HTML</button> : <button className="export-button" onClick={exportReport} disabled={!displayedDesign}><Download size={16} /> 导出 Markdown</button>}</div>
                  </div>

                  {!local && <div className="canvas-empty"><b>待模型分析</b><button type="button" className="model-link" onClick={() => jumpTo('analysis')}>去做模型分析</button></div>}
                  {local && !displayedDesign && !hasHtmlDesign && <section className="selection-empty"><div><span>Step 3</span><h2>页面方案还未生成</h2><InfoHint label="生成前置条件">回到“模型分析”，勾选成功模型，填写 Prompt 后点击“生成改版 UI”。</InfoHint></div><div className="selection-empty-card"><b>{results.length ? `${results.length} 个模型结果已返回` : '暂无模型结果'}</b><span>{results.length ? '支持同时勾选多个模型' : '配置模型后即可生成 HTML'}</span></div></section>}
                  {hasHtmlDesign && evidence && <GeneratedHtmlPreview results={htmlDesigns} jobs={htmlJobs} activeModelId={activeHtmlModelId} onSelectModel={setActiveHtmlModelId} onRetryJob={retryHtmlJob} evidence={evidence} prompt={composedPrompt} />}
                  {hasHtmlDesign && outputFindings.length > 0 && <section className="optimization-diff-list" aria-label="当前页面优化点清单">
                    <header><div><span className="canvas-eyebrow">Optimization diff</span><h2>该页面对应的 P0 / P1 优化点</h2><InfoHint label="优化点清单说明">清单随当前模型切换，保留本地硬约束，并展示生成页面应该解决的结构问题。</InfoHint></div><span>{outputFindings.length} 项</span></header>
                    <div>{outputFindings.map((finding, findingIndex) => <article key={`${finding.source}-${finding.id || findingIndex}`}><span className={`priority ${finding.priority.toLowerCase()}`}>{finding.priority}</span><div><b>{finding.title}</b><p><del>{finding.interpretation}</del><ins>{finding.action}</ins></p><small>{finding.source} · 验证：{finding.validation}</small></div></article>)}</div>
                  </section>}
                  {displayedDesign && !hasHtmlDesign && evidence && <>
                    <section className="blueprint-board">
                      <div className="blueprint-copy">
                        <span>Generated Page · {selectedModelTitle}</span>
                        <h2>{displayedDesign.strategy}</h2>
                        <dl>
                          <div><dt>页面名称</dt><dd>{displayedDesign.pageName}</dd></div>
                          <div><dt>原页基线</dt><dd>{pageBaseline ? `${pageBaseline.siteName} · ${pageBaseline.pageTitle}` : '未抓取'}</dd></div>
                          <div><dt>桌面端</dt><dd>{displayedDesign.desktop}</dd></div>
                          <div><dt>移动端</dt><dd>{displayedDesign.mobile}</dd></div>
                          <div><dt>视觉主题</dt><dd>{displayedDesign.theme.tone} · {displayedDesign.theme.accent}</dd></div>
                        </dl>
                      </div>
                      <GeneratedPagePreview design={displayedDesign} evidence={evidence} local={local!} />
                    </section>
                    {displayedDesign.diagnosis?.length && <section className="growth-evidence-chain">
                      <header><div><span className="canvas-eyebrow">Evidence chain</span><h2>诊断证据与页面改动一一对应</h2></div><button type="button" className="model-link" onClick={() => jumpTo('analysis')}><Crosshair size={14} />回到热力图定位</button></header>
                      <div className="diagnosis-grid">{displayedDesign.diagnosis.map((item) => <article key={item.id} className={`diagnosis-card severity-${item.severity}`}><div><span>{item.id}</span><b>{item.severity}</b></div><h3>{item.problem}</h3><p>{item.evidence}</p></article>)}</div>
                      {displayedDesign.changes?.length && <div className="change-list">{[...displayedDesign.changes].sort((a, b) => a.priority - b.priority).map((change) => <article key={`${change.module}-${change.priority}`}><span>{String(change.priority).padStart(2, '0')}</span><div><b>{change.module}</b><p>{change.after}</p><small>{change.rationale}</small></div><div className="evidence-tags">{change.evidenceRef.map((ref) => <em key={ref}>{ref}</em>)}</div></article>)}</div>}
                    </section>}
                    <GeneratedDesignLogic design={displayedDesign} evidence={evidence} local={local!} />
                    <section className="specs">
                      <div>
                        <h3>区块与组件规格</h3>
                        {displayedDesign.sections.map((section, index) => <article key={`${section.kind}-${index}`}>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <div><b>{section.title}</b><p>{section.kind}{'description' in section && section.description ? ` · ${section.description}` : ''}</p></div>
                          <small>{section.kind === 'cards' ? `${section.items.length} 张卡片` : section.kind === 'metrics' ? `${section.items.length} 个指标` : section.kind === 'timeline' ? `${section.steps.length} 个步骤` : section.kind === 'faq' ? `${section.items.length} 个问答` : section.kind === 'proof' ? `${section.items.length} 条证明` : section.kind === 'split' ? section.rightTitle : section.kind === 'cta' ? `${section.primaryCta} / ${section.secondaryCta}` : section.body}</small>
                        </article>)}
                      </div>
                      <div className="event-specs">
                        <h3>建议事件合同</h3>
                        {displayedDesign.events.map((event) => <article key={event.event}><code>{event.event}</code><p>{event.properties}</p><small>{event.purpose}</small></article>)}
                      </div>
                    </section>
                  </>}
                </section>}

                {currentPanel === 'review' && <section id="review" className="canvas-panel">
                  <div className="canvas-header"><div><span className="canvas-eyebrow">Step 4</span><h2>上线后复盘</h2><InfoHint label="复盘口径说明">上传改版后的同口径数据，比较版本、设备、时间窗口与目标事件；没有实验或结果事件时，只报告观察变化。</InfoHint></div></div>
                  <div className="review-board">
                    <UploadField label="上传改版后行为数据" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => importBehavior(event, true)} onClear={() => clearBehavior(true)} fileName={afterBehavior?.sourceName} description="保持同一页面范围、设备和统计口径" />
                    {afterBehavior && behavior
                      ? <div className="review-result">
                        <div><span>改版前总点击</span><b>{number.format(behavior.clicks)}</b></div>
                        <div><span>改版后总点击</span><b>{number.format(afterBehavior.clicks)}</b></div>
                        <div><span>主 CTA 点击</span><b>{primaryCta ? `${number.format(beforeCtaClicks)} → ${number.format(afterCtaClicks)}` : '需先填写核心 CTA'}</b></div>
                        <InfoHint label="结果数据要求">点击量对比不代表转化提升；判断是否达到预期还需 page_version、PV/UV、模块曝光、goal_start / goal_complete 和实验分流信息。</InfoHint>
                      </div>
                      : <p className="review-empty">待导入改版数据</p>}
                  </div>
                </section>}
              </div>
              <div ref={wizardBottomBarRef} className="wizard-bottom-bar">
                <div className="persistent-caveat"><CircleAlert size={14} /><span>当前仅基于 {local?.dataLevel || '页面点击观察'}；点击次数不替代转化、留存或因果证明，上线后必须按页面版本与结果事件复盘。</span></div>
                <div className={`mobile-wizard-actions ${mobileActionPulse ? 'pulse' : ''}`} aria-label="Wizard 操作">
                  <button type="button" className="mobile-wizard-back" onClick={previousStep} disabled={currentStep === 0}>上一步</button>
                  <button type="button" className="mobile-wizard-next" onClick={nextStep} data-gated={currentStep === 0 ? !requiredEvidenceReady : currentStep === 1 ? !selectedJobsComplete : currentStep === 2 ? !hasHtmlDesign && !displayedDesign : !afterBehavior}>{currentStep === 3 ? '完成复盘' : '下一步'}</button>
                </div>
              </div>
              {mobileToast && <div className="mobile-toast" role="status" aria-live="polite">{mobileToast}</div>}
          </main>
        </section>
      </div>}
      {consoleView === 'knowledge' && <KnowledgeView models={models} onOpenModels={() => router.push('/models?configure=1')} />}
      {consoleView === 'history' && <div className="console-page"><div className="history-empty"><b>历史记录已迁移到独立只读视图</b><span>历史快照不再挂载诊断 Wizard。</span><button type="button" className="console-button primary" onClick={() => router.push('/history')}>打开历史记录</button></div></div>}
      {consoleView === 'models' && <ModelConfigView models={models} onOpen={() => { setModelDialogOpen(true); setModelError(''); }} />}
      </div>
      </section>
      <ConsoleFooter />
    </main>

    <Dialog.Root open={modelDialogOpen} onOpenChange={(open) => { setModelDialogOpen(open); if (!open) { setShowModelForm(false); setEditingModel(undefined); setModelError(''); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="model-dialog-overlay" />
        <Dialog.Content className="model-dialog-content" aria-describedby="model-dialog-description">
          <div className="model-dialog-head">
            <div><Dialog.Title>模型服务</Dialog.Title><div className="model-dialog-description-row"><Dialog.Description id="model-dialog-description">管理地址、密钥和连通性。</Dialog.Description><InfoHint label="模型服务说明">每次分析会先跑本地规则，再并行调用模型；选中结果后，可继续生成独立 UI。</InfoHint></div></div>
            <Dialog.Close asChild><button type="button" className="dialog-close" aria-label="关闭模型服务"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="model-dialog-body">
            {models.length === 0 && !showModelForm && <div className="model-empty"><KeyRound size={20} /><b>尚未添加模型服务</b></div>}
            {models.length > 0 && <div className="model-list model-dialog-list">
              {models.map((model) => <div className="model-card" key={model.id}>
                <div className="model-card-row">
                  <label><input type="checkbox" checked={model.enabled} onChange={() => setModels((items) => items.map((item) => item.id === model.id ? { ...item, enabled: !item.enabled } : item))} /><span><b>{model.name}</b><small>{model.model} / {protocolLabel(model.protocol)}</small></span></label>
                  <div className="model-card-actions">
                    <span className={`connection-status ${model.connectionStatus || 'untested'}`}>{model.connectionStatus === 'success' ? <CircleCheck size={14} /> : model.connectionStatus === 'failed' ? <CircleAlert size={14} /> : <Wifi size={14} />}{model.connectionStatus === 'success' ? `连接成功${model.connectionLatencyMs ? ` / ${model.connectionLatencyMs}ms` : ''}` : model.connectionStatus === 'testing' ? '检测中' : model.connectionStatus === 'failed' ? '连接失败' : '未检测'}</span>
                    <button type="button" className="model-action" onClick={() => checkModelConnection(model)} disabled={model.connectionStatus === 'testing'}><Wifi size={14} /> {model.connectionStatus === 'testing' ? '检测中' : '测试连接'}</button>
                    <button type="button" className="model-action" onClick={() => { setEditingModel({ ...model }); setModelError(''); }}><Pencil size={14} /> 编辑</button>
                    <button type="button" className="model-delete" aria-label={`删除 ${model.name}`} onClick={() => { setModels((items) => items.filter((item) => item.id !== model.id)); if (editingModel?.id === model.id) setEditingModel(undefined); }}><X size={15} /></button>
                  </div>
                </div>
                {model.connectionStatus === 'failed' && <p className="model-connection-error">{model.connectionError || '未能连接到模型服务。请编辑配置后重试。'}</p>}
                {editingModel && editingModel.id === model.id && <form className="model-edit-form" onSubmit={saveModelEdit}>
                  <label>显示名称<input value={editingModel.name} onChange={(event) => setEditingModel({ ...editingModel, name: event.target.value })} /></label>
                  <label>协议<select value={editingModel.protocol} onChange={(event) => setEditingModel({ ...editingModel, protocol: event.target.value as ModelConfig['protocol'], connectionStatus: 'untested', connectionError: undefined, connectionLatencyMs: undefined })}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option><option value="anthropic_messages">Anthropic Messages API</option></select></label>
                  <label className="wide">Base URL<input type="url" value={editingModel.baseUrl} onChange={(event) => setEditingModel({ ...editingModel, baseUrl: event.target.value })} /></label>
                  <label>模型 ID<input value={editingModel.model} onChange={(event) => setEditingModel({ ...editingModel, model: event.target.value })} /></label>
                  <label>推理强度<select value={editingModel.reasoningEffort || 'medium'} onChange={(event) => setEditingModel({ ...editingModel, reasoningEffort: event.target.value as NonNullable<ModelConfig['reasoningEffort']> })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label>
                  <label>超时（秒）<input type="number" min="30" max="300" value={editingModel.timeoutSeconds} onChange={(event) => setEditingModel({ ...editingModel, timeoutSeconds: Number(event.target.value) || 30 })} /></label>
                  <label className="wide">API Key<input type="password" autoComplete="off" value={editingModel.apiKey} onChange={(event) => setEditingModel({ ...editingModel, apiKey: event.target.value })} /></label>
                  {modelError && <p className="model-form-error" role="alert">{modelError}</p>}
                  <div className="model-edit-actions"><button type="submit" className="add-model"><Save size={14} /> 保存修改</button><button type="button" className="model-action" onClick={() => { setEditingModel(undefined); setModelError(''); }}>取消</button></div>
                </form>}
              </div>)}
            </div>}
            {showModelForm
              ? <form className="model-form model-dialog-form" onSubmit={addModel}>
                <div className="form-block-title"><b>添加模型服务</b><InfoHint label="连接检测说明">添加后请先测试连接，再参与分析。</InfoHint></div>
                <label>显示名称<input value={modelDraft.name} onChange={(event) => { setModelDraft({ ...modelDraft, name: event.target.value }); setModelError(''); }} placeholder="例如：GPT 分析" /></label>
                <label>协议<select value={modelDraft.protocol} onChange={(event) => { setModelDraft({ ...modelDraft, protocol: event.target.value as ModelConfig['protocol'] }); setModelError(''); }}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option><option value="anthropic_messages">Anthropic Messages API</option></select></label>
                <label className="wide">Base URL<input type="url" value={modelDraft.baseUrl} onChange={(event) => { setModelDraft({ ...modelDraft, baseUrl: event.target.value }); setModelError(''); }} placeholder="https://api.example.com/v1" /></label>
                <label>模型 ID<input value={modelDraft.model} onChange={(event) => { setModelDraft({ ...modelDraft, model: event.target.value }); setModelError(''); }} placeholder="gpt-5.4" /></label>
                <label>推理强度<select value={modelDraft.reasoningEffort} onChange={(event) => setModelDraft({ ...modelDraft, reasoningEffort: event.target.value as NonNullable<ModelConfig['reasoningEffort']> })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label>
                <label>超时（秒）<input type="number" min="30" max="300" value={modelDraft.timeoutSeconds} onChange={(event) => setModelDraft({ ...modelDraft, timeoutSeconds: Number(event.target.value) || 30 })} /></label>
                <label className="wide">API Key<input type="password" autoComplete="off" value={modelDraft.apiKey} onChange={(event) => { setModelDraft({ ...modelDraft, apiKey: event.target.value }); setModelError(''); }} placeholder="仅在本次分析请求中通过 HTTPS 发送" /></label>
                {modelError && <p className="model-form-error" role="alert">{modelError}</p>}
                <div className="model-edit-actions"><button className="add-model" type="submit"><Plus size={15} /> 添加模型</button><button type="button" className="model-action" onClick={() => { setShowModelForm(false); setModelError(''); }}>取消</button></div>
              </form>
              : <button type="button" className="add-model add-model-trigger" onClick={() => { setShowModelForm(true); setEditingModel(undefined); setModelError(''); }}><Plus size={15} /> 添加模型服务</button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
