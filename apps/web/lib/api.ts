import type { ElementRecord, ImportedClicks } from './csv';

export type Goal = '注册/试用' | '购买/询价' | '内容消费' | '活动领取' | '自定义关键动作';
export type Audience = '2B' | '2C' | '2G';
export type ProviderProtocol = 'responses' | 'chat_completions';
export type BrandTone = 'teal' | 'warm' | 'slate';
export type ModelConfig = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  protocol: ProviderProtocol;
  apiKey: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  timeoutSeconds: number;
  enabled: boolean;
  connectionStatus?: 'untested' | 'testing' | 'success' | 'failed';
  connectionError?: string;
  connectionLatencyMs?: number;
};
export type Evidence = {
  url: string;
  goal: Goal;
  device: string;
  audience: Audience;
  brandColor: string;
  brandTone: string;
  primaryCta: string;
  notes: string;
  heatmapName?: string;
  heatmapDataUrl?: string;
  pageBaseline?: PageBaseline;
  behavior: ImportedClicks;
  markedCtaIds: string[];
};
export type Insight = {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  evidence: string[];
  interpretation: string;
  action: string;
  validation: string;
  guardrail: string;
};
export type PageArchetype = 'product' | 'campaign' | 'pricing' | 'content' | 'generic';
export type PageBaseline = {
  siteName: string;
  host: string;
  pageTitle: string;
  heroTitle?: string;
  description?: string;
  navItems: string[];
  primaryCtas: string[];
  sections: string[];
  themeColor?: string;
  tone: BrandTone;
  source: 'fetched' | 'demo';
  fetchedAt?: string;
};
export type Blueprint = {
  strategy: string;
  archetype: PageArchetype;
  audience: string;
  visualDirection: string;
  hero: { eyebrow: string; title: string; description: string; primaryCta: string; secondaryCta: string };
  modules: Array<{ title: string; purpose: string; content: string; interaction: string }>;
  desktop: string;
  mobile: string;
  events: Array<{ event: string; properties: string; purpose: string }>;
};
export type PageDesignTheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  border: string;
  radius: string;
  motion: string;
  tone: string;
};
export type PageDesignProofItem = string | { title?: string; body?: string; note?: string };
export type PageDesignSection =
  | { kind: 'metrics'; title: string; description?: string; items: Array<{ label: string; value: string; note?: string }> }
  | { kind: 'cards'; title: string; description?: string; layout?: 'grid' | 'rail' | 'stack'; items: Array<{ title: string; body: string; note?: string; cta?: string }> }
  | { kind: 'split'; title: string; description?: string; leftTitle: string; leftBody: string; rightTitle: string; rightItems: string[] }
  | { kind: 'timeline'; title: string; description?: string; steps: Array<{ title: string; body: string }> }
  | { kind: 'faq'; title: string; description?: string; items: Array<{ question: string; answer: string }> }
  | { kind: 'cta'; title: string; description: string; primaryCta: string; secondaryCta: string }
  | { kind: 'copy'; title: string; body: string }
  | { kind: 'proof'; title: string; items: PageDesignProofItem[] };
export type GeneratedPageDesign = {
  pageName: string;
  strategy: string;
  audience: string;
  theme: PageDesignTheme;
  hero: { eyebrow: string; title: string; description: string; primaryCta: string; secondaryCta: string; supportingPoints: string[] };
  sections: PageDesignSection[];
  desktop: string;
  mobile: string;
  events: Array<{ event: string; properties: string; purpose: string }>;
  notes: string[];
  diagnosis?: Array<{ id: string; evidence: string; problem: string; severity: 'high' | 'mid' | 'low' | '启发式建议' }>;
  changes?: Array<{ module: string; before: string; after: string; rationale: string; evidenceRef: string[]; priority: number }>;
  visualSpec?: { primary: string; typeScale: string; spacing: string; audienceNotes: string };
  renderHtml?: string;
  schemaVersion?: 'growth-ui-v1';
  sourceModel?: string;
  sourceModelId?: string;
};
export type LocalAnalysis = { dataLevel: 'L1 点击观察' | 'L2 页面效率'; quality: number; warnings: string[]; insights: Insight[]; blueprint: Blueprint; evidenceHash: string };
export type ModelResult = { modelId: string; modelName: string; status: 'success' | 'failed'; latencyMs: number; output?: { summary: string; insights: Insight[]; parseMode?: 'strict' | 'salvaged' | 'raw' }; error?: ProviderError | string };
export type ModelAnalysisProgress = { modelId: string; modelName: string; status: 'queued' | 'running' | 'success' | 'failed'; latencyMs?: number; error?: ProviderError | string };
export type PageDesignResult = { modelId: string; modelName: string; status: 'success' | 'failed'; latencyMs: number; output?: { summary: string; design?: GeneratedPageDesign; parseMode?: 'strict' | 'salvaged' | 'raw' }; error?: ProviderError | string };
export type ErrorReason =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'AUTH_ERROR'
  | 'CONTENT_FILTER'
  | 'MODEL_NOT_SUPPORT'
  | 'TIMEOUT'
  | 'STREAM_INTERRUPTED'
  | 'INVALID_HTML'
  | 'UPSTREAM_ERROR'
  | 'UNKNOWN';
export type ProviderError = {
  provider: string;
  code?: string;
  httpStatus?: number;
  reason: ErrorReason;
  message: string;
  raw?: string;
  retryable: boolean;
  retryAfterMs?: number;
  occurredAt: string;
};
export type HtmlDesignResult = { modelId: string; modelName: string; status: 'success' | 'failed'; latencyMs: number; output?: { summary: string; html: string; parseMode?: 'strict' | 'salvaged' | 'raw' }; error?: ProviderError | string };
export type KnowledgeSynthesisResult = { modelId: string; modelName: string; status: 'success' | 'failed'; latencyMs: number; output?: { summary: string; principles: Array<{ id?: string; category?: string; severity?: 'P0' | 'P1' | 'P2'; title: string; principle?: string; evidence?: string; action?: string; validation?: string; guardrail?: string; tags?: string[] }>; parseMode?: 'strict' | 'raw' }; error?: ProviderError | string };

/** Convert legacy string errors and structured provider errors into safe UI text. */
export function formatProviderError(error: unknown, fallback = '模型调用失败，请查看模型配置或稍后重试。'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const format = new Intl.NumberFormat('zh-CN');
const ctaPattern = /登录|注册|试用|体验|购买|咨询|获取|开始|提交|领取|开通|订阅|报价|apikey|api\s*key/i;
const unique = <T,>(values: T[]) => [...new Set(values)];
const campaignPattern = /activity|campaign|spring|活动|福利|领取|报名|大促|限时|促销/i;
const pricingPattern = /plan|pricing|套餐|价格|报价|版本|购买|询价|配额/i;
const contentPattern = /blog|docs|guide|article|case|whitepaper|教程|案例|文档|实践/i;
const productPattern = /agent|ai|api|console|platform|sdk|模型|接入|能力|产品/i;

function intentCopy(goal: Goal) {
  if (goal === '注册/试用') return { primary: '免费获取 API Key', secondary: '查看模型与价格', title: '先完成一次真实体验，再决定下一步', strategy: '降低首次接入门槛，把用户从浏览推进到可开始的体验路径。' };
  if (goal === '购买/询价') return { primary: '获取适用方案', secondary: '查看价格与权益', title: '先匹配业务需求，再进入购买或咨询', strategy: '减少套餐理解成本，用场景和体量帮助用户完成选择。' };
  if (goal === '活动领取') return { primary: '查看可领取权益', secondary: '查看活动规则', title: '找到适合你的活动权益', strategy: '按用户需求分流，先讲清权益和资格，再引导领取或购买。' };
  if (goal === '内容消费') return { primary: '继续阅读与实践', secondary: '查看相关资源', title: '把高兴趣内容承接为下一步行动', strategy: '让内容阅读、资源获取和后续动作形成连续路径。' };
  return { primary: '开始下一步', secondary: '了解详情', title: '用一个明确动作承接用户意图', strategy: '收敛页面主路径，减少用户做决定前的无效跳转。' };
}

function baselineVisualPrefix(baseline?: PageBaseline) {
  if (!baseline) return '';
  return `延续 ${baseline.siteName} 当前页面的品牌语气和信息框架，`;
}

function inferArchetype(evidence: Evidence): PageArchetype {
  const url = `${evidence.url} ${evidence.notes}`.toLowerCase();
  const elementNames = evidence.behavior.elements.slice(0, 12).map((item) => item.name).join(' ');
  const combined = `${url} ${elementNames}`;
  if (campaignPattern.test(combined) || evidence.goal === '活动领取') return 'campaign';
  if (pricingPattern.test(combined) || evidence.goal === '购买/询价') return 'pricing';
  if (contentPattern.test(combined) || evidence.goal === '内容消费') return 'content';
  if (productPattern.test(combined) || evidence.goal === '注册/试用') return 'product';
  return 'generic';
}

function archetypeAudience(archetype: PageArchetype, goal: Goal) {
  if (archetype === 'campaign') return '面向被权益或时效驱动的用户，先说明资格、权益和领取动作。';
  if (archetype === 'pricing') return '面向已经有采购或预算意图的用户，先降低套餐和适配性理解成本。';
  if (archetype === 'content') return '面向先看内容再行动的用户，先承接高兴趣信息，再给下一步。';
  if (archetype === 'product') return goal === '注册/试用' ? '面向希望快速试用能力的用户，先给低门槛体验，再补充决策信息。' : '面向正在评估产品能力的用户，先展示能否解决问题，再引导下一步。';
  return '面向意图尚未完全明确的用户，先讲清价值、对象和唯一主路径。';
}

function visualDirection(archetype: PageArchetype) {
  if (archetype === 'campaign') return '首屏加入权益卡、时间或资格提示，视觉重心放在主权益与领取动作。';
  if (archetype === 'pricing') return '用对比列和锚点卡片组织套餐，减少装饰性卡片堆叠。';
  if (archetype === 'content') return '采用内容型长页结构，强化标题层级、摘要区和资源承接位，减少过度营销按钮。';
  if (archetype === 'product') return '保留产品站的信任感，首屏以价值与操作预览并列，重点放在首个成功动作。';
  return '保持原站视觉语言，用更清晰的信息层级和更少的竞争性动作提高决策效率。';
}

function focusElement(evidence: Evidence) {
  return evidence.behavior.elements.find((item) => item.kind !== '导航') || evidence.behavior.elements[0];
}

function blueprintModules(archetype: PageArchetype, evidence: Evidence) {
  const focus = focusElement(evidence);
  const focusLabel = focus?.name || '高兴趣内容';
  if (archetype === 'campaign') {
    return [
      { title: '权益总览与立即领取', purpose: '首屏先解释本次活动给谁、能拿到什么、现在该做什么。', content: '主权益数字、适用对象、截止时间和一个唯一主 CTA。', interaction: '首屏只保留一个领取动作；规则查看改为次级链接。' },
      { title: '人群分流与适配入口', purpose: '按新客、老客、开发者、采购方等不同人群给出对应入口。', content: `把用户最关注的“${focusLabel}”改成人群卡片，每张卡只讲资格、权益和下一步。`, interaction: '点击人群卡后保留 scene_id，并在卡片内直接展示对应 CTA。' },
      { title: '规则与门槛解释', purpose: '减少因为资格、时间、使用条件不清造成的犹豫。', content: '把活动规则拆成资格、流程、限制和到账时间 4 个短段，不堆成长文。', interaction: '规则展开后就近给出“确认资格后领取”的 CTA。' },
      { title: '领取后承接', purpose: '让用户拿完权益后继续进入注册、下单或激活流程。', content: '领取成功页或页内确认区直接说明下一步：注册、开通、创建或购买。', interaction: '成功状态记录 goal_start，并提供吸底主 CTA。' },
    ];
  }
  if (archetype === 'pricing') {
    return [
      { title: '方案匹配与主路径', purpose: '先让用户知道该看哪一档，而不是把所有套餐一起堆给用户。', content: '首屏补一个“你属于哪类需求”的短分流，主 CTA 指向最合适的方案。', interaction: '选择需求后高亮对应套餐，并记录 package_intent。' },
      { title: '套餐对比锚点', purpose: '用固定列或分段卡片解释价格、配额、适用场景和升级边界。', content: `如果“${focusLabel}”点击高，优先把它放进对比卡的第一屏，而不是埋在下方说明。`, interaction: '比较列吸顶或锚点跳转，避免用户反复滚回查找。' },
      { title: '成本与风险消解', purpose: '减少采购前的不确定性，例如价格规则、试用边界、账单方式和 SLA。', content: 'FAQ 改成“常见采购问题 + 对应答案 + 就近 CTA”。', interaction: '展开问题后显示咨询或试用按钮，并区分 faq_topic。' },
      { title: '咨询或购买承接', purpose: '让不同体量用户都能快速进入下一步。', content: '自助购买与销售咨询分开呈现，但都服从同一业务目标和事件定义。', interaction: '桌面端侧边固定 CTA，移动端用分段吸底 CTA。' },
    ];
  }
  if (archetype === 'content') {
    return [
      { title: '内容摘要与下一步', purpose: '用户先看内容时，首屏需要把收益点和延伸动作放在一起。', content: '标题下给 3 条收获摘要，再用一个低门槛 CTA 承接阅读后的动作。', interaction: '阅读进度到关键段落后出现就近 CTA，不强制一上来打断阅读。' },
      { title: '高兴趣内容承接', purpose: '把最高点击内容从“阅读终点”改成“阅读后下一步”。', content: `围绕“${focusLabel}”增加案例、模板或资源下载，并直接连接到注册、试用或咨询。`, interaction: '内容块内记录 detail_open、resource_download 和 followup_cta_click。' },
      { title: '案例与可信依据', purpose: '让用户在继续阅读时同时建立信任，不必再跳去别处找证明。', content: '在内容中段插入适用场景、实测结果或客户案例，而不是单独堆一整屏 logo。', interaction: '案例卡允许横向浏览，但每张卡都保留下一步入口。' },
      { title: '延伸资源与转化入口', purpose: '内容页的转化通常发生在资源、模板、试用或联系动作。', content: '页末改成“继续学习 / 立即实践 / 获取支持”三分流。', interaction: '根据来源渠道和阅读深度展示不同 CTA 文案。' },
    ];
  }
  if (archetype === 'product') {
    return [
      { title: '价值陈述与首次体验', purpose: '先告诉用户能做什么，再把他们推进到一次可完成的体验。', content: '首屏讲一句核心价值、三个真实能力点和一个低门槛主 CTA。', interaction: '主 CTA 固定可见；次 CTA 只保留价格、文档或 demo 之一。' },
      { title: '场景入口与意图分流', purpose: '按照典型使用场景组织入口，减少用户在多个信息模块间来回切换。', content: `把“${focusLabel}”这类高兴趣模块改成场景卡：适合谁、解决什么、开始后能获得什么。`, interaction: '点击场景后保留 scene_id，并把后续 CTA 文案同步为对应场景。' },
      { title: '上手路径与关键门槛', purpose: '把注册、获取密钥、调用、成功返回等动作排成一条可执行路径。', content: '展示 3 步内完成首次成功动作的流程，并提前解释价格、权限、模型或配额门槛。', interaction: '每一步都可展开查看细节，展开后显示就近 CTA。' },
      { title: '信任建立与继续决策', purpose: '在用户准备行动前补齐案例、性能、价格和文档等决策信息。', content: '案例、文档、价格与 FAQ 按“先试用，再深入了解”的顺序收束。', interaction: '为文档、案例和价格 CTA 加 entry_position，便于区分比较路径。' },
    ];
  }
  return [
    { title: '价值与核心行动', purpose: '在首屏建立意图匹配并提供单一主路径。', content: '一句业务价值 + 3 个可验证收益 + 主/次 CTA。', interaction: '主 CTA 固定可见；次 CTA 降级为文字或描边按钮。' },
    { title: '场景或需求分流', purpose: '把不同意图导向对应的产品、活动或套餐。', content: '2-4 个场景标签，每项说明“适合谁、得到什么”。', interaction: '选择后保留上下文，CTA 带上 scene_id。' },
    { title: '决策信息', purpose: '用价格、能力、案例或规则降低行动前的不确定性。', content: '按目标选择套餐锚点、权益说明、调用示例或资格规则。', interaction: '展开内容后给出就近 CTA，不让用户回到首屏寻找下一步。' },
    { title: '开始使用/领取', purpose: '把用户推进到可衡量的关键动作。', content: '三步流程和预期结果，例如注册、领取、创建、完成首次使用。', interaction: '每一步记录状态；移动端在关键段落展示吸底主 CTA。' },
  ];
}

function defaultBlueprint(evidence: Evidence): Blueprint {
  const copy = intentCopy(evidence.goal);
  const archetype = inferArchetype(evidence);
  const baselinePrefix = baselineVisualPrefix(evidence.pageBaseline);
  const visualDirectionText = `${baselinePrefix}${visualDirection(archetype)}`;
  return {
    strategy: copy.strategy,
    archetype,
    audience: archetypeAudience(archetype, evidence.goal),
    visualDirection: visualDirectionText,
    hero: {
      eyebrow: evidence.pageBaseline?.siteName ? `${evidence.pageBaseline.siteName} 页面改版方向` : '针对当前页面的改版方向',
      title: copy.title,
      description: evidence.pageBaseline?.description
        ? `保留原页面的主题与品牌语气，同时把主路径收敛到一个更容易开始的动作。当前页面描述为：${evidence.pageBaseline.description.slice(0, 72)}。`
        : '首屏只保留一个明确的主要行动，并用可理解的价值、适用场景和低门槛承接降低决策摩擦。',
      primaryCta: evidence.primaryCta || copy.primary,
      secondaryCta: copy.secondary,
    },
    modules: blueprintModules(archetype, evidence),
    desktop: archetype === 'pricing' ? '首屏先做需求分流，再进入套餐对比；对比区使用清晰列结构与锚点跳转，不再用平均卡片。'
      : archetype === 'campaign' ? '首屏左侧讲权益、右侧讲资格或活动时间；中部模块按人群和领取路径展开。'
      : archetype === 'content' ? '首屏采用标题摘要 + 资源承接；正文中段插入案例和就近 CTA，尾部再做分流。'
      : '首屏采用左侧价值与 CTA、右侧可信信息或操作预览；决策区使用不对称两列，避免平均卡片堆叠。',
    mobile: archetype === 'pricing' ? '移动端把套餐改为纵向分段卡，先展示推荐方案；关键差异用折叠列表展开。'
      : archetype === 'campaign' ? '移动端首屏直接展示权益和资格提示，主 CTA 吸顶或吸底；规则区使用分段折叠。'
      : archetype === 'content' ? '移动端优先阅读体验，只在关键段落和页末给出宽按钮 CTA。'
      : '首屏文案优先、主 CTA 全宽；分流和决策信息改为纵向列表；仅在行动意图明确的模块显示吸底 CTA。',
    events: [
      { event: 'page_view', properties: 'page_version, device_type, experiment_id', purpose: '提供页面版本和流量分母。' },
      { event: 'module_exposure', properties: 'module_id, position, page_version', purpose: '判断关键内容是否被看到。' },
      { event: 'cta_click', properties: 'module_id, cta_type, target_url', purpose: '比较主次 CTA 与不同位置承接。' },
      { event: 'goal_start', properties: 'goal_type, entry_position', purpose: '记录注册、领取、咨询或购买开始。' },
      { event: 'goal_complete', properties: 'goal_type, page_version', purpose: '验证真实业务结果，不能由点击替代。' },
    ],
  };
}

export async function evidenceHash(evidence: Evidence) {
  const stable = JSON.stringify({ ...evidence, heatmapName: evidence.heatmapName, behavior: { ...evidence.behavior, elements: evidence.behavior.elements.map(({ id, ...item }) => item) } });
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return Array.from(new Uint8Array(value)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function runLocalAnalysis(evidence: Evidence): Promise<LocalAnalysis> {
  const { behavior } = evidence; const marked = behavior.elements.filter((item) => evidence.markedCtaIds.includes(item.id));
  const ctas = marked.length ? marked : behavior.elements.filter((item) => item.kind === 'CTA' || ctaPattern.test(item.name));
  const ctaClicks = ctas.reduce((sum, item) => sum + item.clicks, 0);
  const ctaShare = behavior.clicks ? Number((ctaClicks / behavior.clicks * 100).toFixed(1)) : 0;
  const top = behavior.elements[0]; const duplicateLabels = unique(behavior.elements.filter((item) => behavior.elements.filter((other) => other.name === item.name).length > 1 && !item.module && !item.selector).map((item) => item.name));
  const insights: Insight[] = [];
  if (duplicateLabels.length) insights.push({ id: 'mapping', priority: 'P0', title: '先补齐同名元素的归因信息', evidence: [`${duplicateLabels.slice(0, 3).join('、')} 出现多次，但缺少模块或选择器。`], interpretation: '当前无法知道具体是哪个页面位置承接了点击，继续按名称汇总会造成伪精确结论。', action: '为每个 CTA 补齐 module_id + cta_type 或唯一 selector，并把导航、工具入口与业务 CTA 分开统计。', validation: 'CTA 可归因率达到 98% 以上后再比较模块表现。', guardrail: '不得把同名 CTA 的总点击直接归因给某一张卡或页面区块。' });
  if (!ctas.length) insights.push({ id: 'cta-missing', priority: 'P0', title: '未确认主 CTA，分析不能判断是否承接核心目标', evidence: ['行为表中没有被标记为主 CTA 的元素。'], interpretation: '页面可能有行动入口，但系统无法区分业务主路径和辅助导航。', action: '选择一个核心业务动作并在表内对应元素标为主 CTA；若不同位置复用 CTA，分别记录位置。', validation: '主 CTA 映射覆盖率为 100%。', guardrail: '没有目标 CTA 时不得输出“主 CTA 表现差”。' });
  if (ctas.length && ctaShare < 15) insights.push({ id: 'cta-share', priority: 'P1', title: '核心动作在已记录点击中的份额偏低', evidence: [`主 CTA 合计 ${format.format(ctaClicks)} 次，占已记录点击 ${ctaShare}%。`, `最高点击元素为“${top.name}” (${top.share}%)。`], interpretation: '用户注意力可能被内容浏览、导航或辅助入口分流；仅有点击次数时不能解释为点击率或转化流失。', action: '在首屏收敛为一个主 CTA，强化与页面价值的一致性；在高兴趣内容后增加就近、低门槛的同目标 CTA。', validation: '有 PV/UV 后观察主 CTA 点击 UV / 页面 UV；当前先观察主 CTA 点击份额与模块曝光。', guardrail: '保留必要的导航可用性，避免把辅助入口直接删除。' });
  if (top && top.kind !== 'CTA' && top.share >= 20) insights.push({ id: 'interest-gap', priority: 'P1', title: '高兴趣内容缺少就近的下一步承接', evidence: [`“${top.name}”获得 ${format.format(top.clicks)} 次点击，占 ${top.share}%。`], interpretation: '用户主动探索这一信息，但可能需要进一步了解场景、成本或能力后才会行动。', action: `将“${top.name}”所在模块改为“信息 + 下一步”结构：补充适用场景、关键限制和一个与${evidence.goal}一致的 CTA。`, validation: '记录该模块曝光、详情展开、就近 CTA 点击和后续目标开始事件。', guardrail: '不要把内容点击当作用户已经完成注册、购买或留存。' });
  if (behavior.elements.filter((item) => item.kind === 'CTA').length >= 4) insights.push({ id: 'competition', priority: 'P2', title: '页面可能存在竞争性 CTA', evidence: [`自动识别到 ${behavior.elements.filter((item) => item.kind === 'CTA').length} 个行动型元素。`], interpretation: '多个相近行动可能增加用户判断成本，也可能是不同阶段的合理重复，需要结合页面位置确认。', action: '定义首屏唯一主 CTA；其他位置保持同一业务目标或降级为辅助信息入口，并统一事件属性。', validation: '按 entry_position 比较 CTA 点击与 goal_start，验证是否出现路径分散。', guardrail: '不同位置的重复 CTA 可以保留，前提是其意图和埋点可区分。' });
  if (!insights.length) insights.push({ id: 'baseline', priority: 'P2', title: '点击分布暂未出现明确的规则异常', evidence: [`已导入 ${behavior.elements.length} 个元素，共 ${format.format(behavior.clicks)} 次点击。`], interpretation: '当前可先把热力图作为空间复核依据，并补齐主 CTA、模块、PV/UV 和结果事件。', action: '优先确认高点击元素的页面位置和业务角色，再制定针对性的页面改版假设。', validation: '补齐模块曝光和目标事件后，按同一时间窗口比较页面效率。', guardrail: '不能从当前数据推断转化或留存结果。' });
  const quality = Math.max(20, 100 - behavior.warnings.length * 12 - (duplicateLabels.length ? 22 : 0) - (!evidence.heatmapName ? 10 : 0) - (!evidence.primaryCta ? 8 : 0));
  return { dataLevel: behavior.pagePv || behavior.pageUv ? 'L2 页面效率' : 'L1 点击观察', quality, warnings: behavior.warnings, insights, blueprint: defaultBlueprint(evidence), evidenceHash: await evidenceHash(evidence) };
}

export async function runModelAnalysis(evidence: Evidence, models: ModelConfig[], local?: LocalAnalysis, onProgress?: (progress: ModelAnalysisProgress) => void, knowledge: unknown[] = []): Promise<ModelResult[]> {
  const available = models.filter((model) => model.enabled && model.apiKey.trim() && model.connectionStatus === 'success');
  return Promise.all(available.map(async (model) => {
    const started = Date.now();
    onProgress?.({ modelId: model.id, modelName: model.name, status: 'running' });
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'analysis', evidence, local, knowledge, models: [model] }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `模型分析请求失败 (${response.status})`);
      const result = body?.results?.[0] as ModelResult | undefined;
      const resolved = result || { modelId: model.id, modelName: model.name, status: 'failed' as const, latencyMs: Date.now() - started, error: '模型没有返回分析结果。' };
      onProgress?.({ modelId: model.id, modelName: model.name, status: resolved.status, latencyMs: resolved.latencyMs || Date.now() - started, error: resolved.error });
      return resolved;
    } catch (error) {
      const failed: ModelResult = { modelId: model.id, modelName: model.name, status: 'failed', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : '模型分析请求失败。' };
      onProgress?.({ modelId: model.id, modelName: model.name, status: 'failed', latencyMs: failed.latencyMs, error: failed.error });
      return failed;
    }
  }));
}

export async function runModelPageDesign(evidence: Evidence, local: LocalAnalysis, feedback: ModelResult, model: ModelConfig): Promise<PageDesignResult> {
  const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'design', evidence, local, feedback, models: [model] }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `页面生成请求失败 (${response.status})`);
  return body.results?.[0] as PageDesignResult;
}

export async function runModelHtmlDesign(evidence: Evidence, prompt: string, model: ModelConfig, feedback?: ModelResult): Promise<HtmlDesignResult> {
  const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'html', evidence, prompt, feedback, models: [model] }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `HTML 页面生成失败 (${response.status})`);
  return body.results?.[0] as HtmlDesignResult;
}

export async function runKnowledgeSynthesis(input: { title: string; sourceType: 'operation_doc' | 'analysis_case'; sourceText: string }, existingKnowledge: unknown[], model: ModelConfig): Promise<KnowledgeSynthesisResult> {
  const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'knowledge', knowledgeInput: input, feedback: existingKnowledge, models: [model] }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `运营方法论归纳失败 (${response.status})`);
  return body?.results?.[0] as KnowledgeSynthesisResult;
}

export async function testModelConnection(model: ModelConfig): Promise<{ latencyMs: number }> {
  const response = await fetch('/api/model-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `连接检测失败 (${response.status})`);
  return { latencyMs: Number(body.latencyMs) || 0 };
}
