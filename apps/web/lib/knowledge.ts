export const KNOWLEDGE_STORAGE_KEY = 'heatscope.knowledge.v1';
export const KNOWLEDGE_SCHEMA_VERSION = 1 as const;

export type KnowledgeSeverity = 'P0' | 'P1' | 'P2';
export type KnowledgeSourceType = 'mother_case' | 'operation_doc' | 'analysis_case' | 'manual';

export type KnowledgeEntry = {
  id: string;
  category: string;
  severity: KnowledgeSeverity;
  title: string;
  principle: string;
  evidence: string;
  action: string;
  validation: string;
  guardrail: string;
  tags: string[];
  source: string;
  enabled: boolean;
  updatedAt: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  type: KnowledgeSourceType;
  summary: string;
  importedAt: string;
  entryIds: string[];
};

export type KnowledgeLibrary = {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION;
  entries: KnowledgeEntry[];
  sources: KnowledgeSource[];
  updatedAt: string;
};

export type KnowledgeSynthesisResult = {
  summary: string;
  principles: Array<Partial<KnowledgeEntry> & { title: string }>;
};

const motherCaseEntries: Array<Omit<KnowledgeEntry, 'id' | 'updatedAt' | 'source'>> = [
  {
    category: '用户意图与 CTA', severity: 'P0', title: '先判断用户意图，再决定主 CTA',
    principle: '先从点击行为、页面语义和业务目标判断用户是在试用/接入、购买/询价还是内容探索，再安排首个行动。',
    evidence: 'AI 推理页首屏输入区域点击占 24.40%，模型广场 8.88%，控制台 6.88%，API Key 3.19%，而套餐入口明显较低，说明用户更偏向先试用和接入。',
    action: '当用户意图偏试用或接入时，首屏使用“免费获取 API Key / 立即免费接入”作为主 CTA；“查看模型与价格”降为次级入口。',
    validation: '分别记录 hero_exposure、goal_start、api_key_created、first_success_call，并按入口位置比较后续完成率。',
    guardrail: '点击热度只能证明兴趣，不能把高点击直接表述为转化或留存提升。', tags: ['CTA', '意图', '试用'], enabled: true,
  },
  {
    category: '首屏承接', severity: 'P0', title: '首屏只承接一个主目标',
    principle: '一个页面首屏只设置一个主目标，其他入口必须明确降级关系，避免模型、文档、套餐和注册动作互相竞争。',
    evidence: '首屏跳出率约 60%，但输入区是最强行动信号；多个抽象能力入口和套餐入口没有形成连续承接。',
    action: '把用户完成的第一个真实动作作为首屏主路径，辅助入口收纳到次级按钮或下方模块，并为每种入口设置独立事件。',
    validation: '对比首屏唯一 CTA 的曝光、点击、目标开始和目标完成；同时观察辅助入口是否影响核心路径。',
    guardrail: '不要为了收敛 CTA 删除必要的导航、文档或企业咨询入口。', tags: ['首屏', '信息层级', '漏斗'], enabled: true,
  },
  {
    category: '信息与行动', severity: 'P0', title: '信息模块和行动模块要就近',
    principle: '用户对场景、能力、价格或案例产生兴趣后，下一步动作必须出现在同一视线或同一模块内。',
    evidence: '套餐页先展示模型覆盖、折扣和周期 tabs，关键套餐 CTA 出现过晚；计划卡片 50% 到达率变化不明显。',
    action: '把计划/资源包上移，在高兴趣内容后直接放“开始试用、获取报价或选择方案”的 CTA，避免用户回到首屏寻找入口。',
    validation: '埋点 module_exposure、detail_open、nearby_cta_click、goal_start，按模块位置比较承接效率。',
    guardrail: '就近 CTA 仍需说明前置条件和点击后的结果，不制造误导性捷径。', tags: ['就近 CTA', '模块', '到达率'], enabled: true,
  },
  {
    category: 'CTA 文案', severity: 'P0', title: '行动型 CTA 必须说明结果',
    principle: 'CTA 要让用户知道点击后会发生什么，避免用“前往了解”这类无法判断成本和结果的模糊表达。',
    evidence: '套餐页“前往了解”是信息型按钮，用户不知道点击后是试用、购买、详情还是咨询。',
    action: '按页面目标使用“立即开通企业套餐、领取 API Key 试用、获取企业报价、预约方案咨询、查看适用场景”等结果导向文案。',
    validation: '对比不同 CTA 文案的 click_to_goal_start，并记录 cta_type、module_id 和页面版本。',
    guardrail: '文案不得承诺数据无法证明的转化、节省或增长结果。', tags: ['CTA', '文案', '实验'], enabled: true,
  },
  {
    category: '套餐与选择', severity: 'P1', title: '套餐要用场景和体量锚点帮助选择',
    principle: '不要只展示 S/M/B 或资源包名称，要把适用对象、调用量、团队规模、模型类型和升级边界说清楚。',
    evidence: '用户需要知道 S/M/B 应该选哪一个、自己业务量对应多少钱、买了能否立即使用；资源包名称过长且到达率低于 25%。',
    action: '给 S/M/B 增加“小团队试点 / SaaS 功能上线 / 生产高并发”场景标签，并提供调用量、团队人数、模型类型输入的方案计算器。',
    validation: '记录 package_view、package_compare、calculator_complete、package_intent 和咨询/购买目标事件。',
    guardrail: '计算器的价格和额度必须来自真实配置，不得用示例数字伪装报价。', tags: ['套餐', '选择成本', '定价'], enabled: true,
  },
  {
    category: '首次使用', severity: 'P1', title: '降低首次使用门槛，拆解接入漏斗',
    principle: '把“看懂产品”拆成可完成的连续动作：注册、领取免费额度、创建 API Key、复制示例代码、首次成功调用。',
    evidence: 'AI 页面点击更集中在试用、控制台、API Key，而不是直接购买，说明用户先想验证能力和稳定性。',
    action: '用状态化的 4-5 步接入路径承接首屏 CTA，每一步显示完成反馈和下一步；文档和 Agent 体验作为辅助入口。',
    validation: '记录 signup_start、token_granted、api_key_created、code_copied、first_success_call，并定位每一步流失。',
    guardrail: '免费额度、API Key 权限和限制必须与实际服务一致，避免造成体验落差。', tags: ['接入', '激活', '注册'], enabled: true,
  },
  {
    category: '曝光与到达', severity: 'P1', title: '资源包先解决曝光，再解释购买理由',
    principle: '当重点模块到达率低时，先调整位置、首屏摘要和滚动节奏，再讨论复杂的产品解释。',
    evidence: '资源包区域到达率低于 25%，用户还没看到模块就无法理解名称、价格和适用场景。',
    action: '将资源包摘要上移，用短名称、价格、适用场景和调用规模组成一眼可读的卡片，详细规则后置。',
    validation: '比较 25%/50%/75% 到达率、模块曝光 UV、详情展开和资源包 CTA 点击。',
    guardrail: '到达率提升只说明看到了内容，不能替代业务目标完成。', tags: ['到达率', '资源包', '曝光'], enabled: true,
  },
  {
    category: '数据边界', severity: 'P0', title: '热力点击不是转化',
    principle: '点击次数和热力图只能用于判断兴趣与交互分布，不能单独证明转化、留存、收入或因果效果。',
    evidence: '当前主要输入是元素日点击数和热力图截图，缺少完整曝光、PV/UV、目标完成、版本和实验分流。',
    action: '所有诊断必须区分 L1 点击观察与 L2 页面效率，并在建议中列出还需补充的结果事件和实验口径。',
    validation: '每条建议绑定目标事件、时间窗口、页面版本、设备、流量来源和实验 ID，改版后复盘同口径数据。',
    guardrail: '任何报告、模型提示词和导出文件都不得把点击份额写成 CTR、转化率或留存率。', tags: ['数据边界', '复盘', '指标'], enabled: true,
  },
  {
    category: '复盘与实验', severity: 'P1', title: '每条建议必须可复盘',
    principle: '运营建议不是视觉清单，而是可以被验证和否证的增长假设。',
    evidence: '仅凭页面热力无法知道 CTA 点击是否带来注册或购买，必须补充版本和结果事件。',
    action: '为每个 P0/P1 建议写清目标事件、观察窗口、实验版本、不可下降护栏和成功判定条件。',
    validation: '上线后按版本与流量来源比较 module_exposure、goal_start、goal_complete、留存等真实结果。',
    guardrail: '如果没有结果事件或有效实验分流，结论降级为“观察变化”，不输出因果判断。', tags: ['实验', '复盘', '护栏'], enabled: true,
  },
  {
    category: '信任与表达', severity: 'P1', title: '抽象能力文案要落到具体场景',
    principle: '“企业轻量集成、SaaS 辅助功能、多部门协同”等抽象词不能替代用户对结果、成本和适配性的理解。',
    evidence: '用户尚未建立模型能力、免费额度、调用成本和稳定性信任，难以直接购买高价套餐。',
    action: '用真实任务、调用规模、示例代码、限制说明和适用角色替代空泛能力描述，并在主 CTA 附近解释下一步。',
    validation: '记录场景卡曝光、示例查看、限制说明展开、试用开始和咨询开始。',
    guardrail: '场景案例必须标明适用前提，不把单一案例结果泛化为所有用户都能达到。', tags: ['文案', '场景', '信任'], enabled: true,
  },
];

function now() { return new Date().toISOString(); }
function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMotherCaseLibrary(): KnowledgeLibrary {
  const importedAt = '2026-08-01T00:00:00.000Z';
  const entries = motherCaseEntries.map((entry, index) => ({ ...entry, id: `mother-${String(index + 1).padStart(2, '0')}`, source: '站内MaaS投放页面优化 · 用增案例', updatedAt: importedAt }));
  return {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    entries,
    sources: [{ id: 'mother-case', title: '站内 MaaS 投放页面优化 · 母版案例', type: 'mother_case', summary: '基于 AI Plan、AI 推理页和活动投放页的热力图、点击漏斗与运营复盘归纳出的增长方法论。', importedAt, entryIds: entries.map((entry) => entry.id) }],
    updatedAt: importedAt,
  };
}

export function createKnowledgeEntry(input: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, 'title'>): KnowledgeEntry {
  return {
    id: input.id || makeId('knowledge'), category: input.category || '待分类', severity: input.severity || 'P1', title: input.title,
    principle: input.principle || '', evidence: input.evidence || '', action: input.action || '', validation: input.validation || '', guardrail: input.guardrail || '', tags: input.tags || [], source: input.source || '手工新增', enabled: input.enabled ?? true, updatedAt: now(),
  };
}

export function createKnowledgeSource(input: Pick<KnowledgeSource, 'title'> & Partial<Omit<KnowledgeSource, 'title'>>): KnowledgeSource {
  return {
    id: input.id || makeId('knowledge-source'),
    title: input.title.trim(),
    type: input.type || 'manual',
    summary: input.summary?.trim() || '由运营同学维护的可复用规则库。',
    importedAt: input.importedAt || now(),
    entryIds: [...(input.entryIds || [])],
  };
}

export function updateKnowledgeSource(library: KnowledgeLibrary, sourceId: string, updates: Pick<KnowledgeSource, 'title' | 'summary'>): KnowledgeLibrary {
  const source = library.sources.find((item) => item.id === sourceId);
  const title = updates.title.trim();
  return {
    ...library,
    entries: source
      ? library.entries.map((entry) => source.entryIds.includes(entry.id) ? { ...entry, source: title, updatedAt: now() } : entry)
      : library.entries,
    sources: library.sources.map((item) => item.id === sourceId
      ? { ...item, title, summary: updates.summary.trim() }
      : item),
    updatedAt: now(),
  };
}

export function saveKnowledgeEntryToSource(library: KnowledgeLibrary, entry: KnowledgeEntry, sourceId: string, previousSourceId?: string): KnowledgeLibrary {
  const entryExists = library.entries.some((item) => item.id === entry.id);
  return {
    ...library,
    entries: entryExists
      ? library.entries.map((item) => item.id === entry.id ? entry : item)
      : [...library.entries, entry],
    sources: library.sources.map((source) => {
      if (source.id === sourceId) return source.entryIds.includes(entry.id)
        ? source
        : { ...source, entryIds: [...source.entryIds, entry.id] };
      if (source.id === previousSourceId) return { ...source, entryIds: source.entryIds.filter((entryId) => entryId !== entry.id) };
      return source;
    }),
    updatedAt: now(),
  };
}

export function readKnowledgeLibrary(): KnowledgeLibrary {
  if (typeof window === 'undefined') return createMotherCaseLibrary();
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    if (!raw) return createMotherCaseLibrary();
    const parsed = JSON.parse(raw) as Partial<KnowledgeLibrary>;
    if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.sources)) return createMotherCaseLibrary();
    return { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, entries: parsed.entries, sources: parsed.sources, updatedAt: parsed.updatedAt || now() };
  } catch { return createMotherCaseLibrary(); }
}

export function writeKnowledgeLibrary(library: KnowledgeLibrary) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify({ ...library, schemaVersion: KNOWLEDGE_SCHEMA_VERSION, updatedAt: now() }));
}

export function mergeKnowledgeEntries(library: KnowledgeLibrary, entries: KnowledgeEntry[], source: Omit<KnowledgeSource, 'entryIds' | 'importedAt'>): KnowledgeLibrary {
  const nextEntries = [...library.entries, ...entries];
  const existing = library.sources.some((item) => item.id === source.id);
  const sources = existing
    ? library.sources.map((item) => item.id === source.id ? { ...item, ...source, importedAt: now(), entryIds: [...item.entryIds, ...entries.map((entry) => entry.id)] } : item)
    : [...library.sources, { ...source, importedAt: now(), entryIds: entries.map((entry) => entry.id) }];
  return { ...library, entries: nextEntries, sources, updatedAt: now() };
}
