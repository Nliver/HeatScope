import type { Goal, PageBaseline } from './api';
import type { ImportedClicks } from './csv';

export type DemoCaseId = 'agent' | 'plan' | 'activity';

export type DemoCaseMeta = {
  id: DemoCaseId;
  name: string;
  url: string;
  goal: Goal;
  summary: string;
  heatmapUrl: string;
};

export type DemoCase = DemoCaseMeta & {
  device: string;
  primaryCta: string;
  notes: string;
  heatmapName: string;
  markedCtaIds: string[];
  behavior: ImportedClicks;
  baseline: PageBaseline;
};

export const demoCaseMeta: DemoCaseMeta[] = [
  {
    id: 'agent',
    name: 'AI Agent 页',
    url: 'https://www.qiniu.com/ai/agent',
    goal: '注册/试用',
    summary: '产品能力页案例，适合演示“体验 -> 注册 -> API Key -> 激活”的路径优化。',
    heatmapUrl: '/screenshots/ai-agent-heatmap.png',
  },
  {
    id: 'plan',
    name: 'AI 订阅页',
    url: 'https://www.qiniu.com/ai/plan',
    goal: '购买/询价',
    summary: '套餐与模型选型页案例，适合演示“模型选择 -> 套餐理解 -> 订阅开始”的路径优化。',
    heatmapUrl: '/screenshots/ai-plan-heatmap.png',
  },
  {
    id: 'activity',
    name: '春季活动页',
    url: 'https://marketing.qiniu.com/activity/2026spring',
    goal: '活动领取',
    summary: '活动聚合页案例，适合演示“人群分流 -> 权益理解 -> 领取/购买”的承接方式。',
    heatmapUrl: '/screenshots/spring-activity-heatmap.png',
  },
];

const baseline = {
  agent: {
    siteName: '七牛云',
    host: 'www.qiniu.com',
    pageTitle: 'AI Agent',
    heroTitle: 'AI Agent',
    description: '一站式接入大模型能力，优先完成体验与接入激活。',
    navItems: ['AI 大模型', '产品', '解决方案', '定价'],
    primaryCtas: ['模型广场', 'Agent 体验', '立即体验'],
    sections: ['模型广场', '体验说明', '使用文档', '常见问题'],
    tone: 'teal' as const,
    source: 'demo' as const,
  },
  plan: {
    siteName: '七牛云',
    host: 'www.qiniu.com',
    pageTitle: 'AI 订阅',
    heroTitle: 'AI 订阅',
    description: '统一 API Key 接入多个模型系列，重点解决模型选择与套餐决策。',
    navItems: ['AI 大模型', '产品', '解决方案', '定价'],
    primaryCtas: ['展开全部模型', '包月', '登录免费注册'],
    sections: ['模型列表', '套餐周期', '权益说明', 'FAQ'],
    tone: 'slate' as const,
    source: 'demo' as const,
  },
  activity: {
    siteName: '七牛云',
    host: 'marketing.qiniu.com',
    pageTitle: '2026 春季活动',
    heroTitle: '2026 春季活动',
    description: '多活动聚合页，重点解决同名 CTA 无法归因与人群分流问题。',
    navItems: ['AI 大模型', '新客专区', '云服务器', '控制台'],
    primaryCtas: ['查看优惠', '立即购买', '控制台'],
    sections: ['产品专区', '活动专区', '新客专区', '限时活动'],
    tone: 'warm' as const,
    source: 'demo' as const,
  },
};

const demoCases: Record<DemoCaseId, DemoCase> = {
  agent: {
    ...demoCaseMeta[0],
    device: '桌面端',
    primaryCta: '立即体验',
    notes: '演示案例：七牛 AI Agent 官网页，关注体验与注册后的激活动作。',
    heatmapName: 'ai-agent-heatmap.png',
    markedCtaIds: ['agent-try', 'agent-key'],
    baseline: baseline.agent,
    behavior: {
      sourceName: '演示案例 · AI Agent 页',
      sourceType: 'csv',
      range: '2026-07-18 至 2026-07-24',
      pagePv: 21055,
      pageUv: undefined,
      clicks: 8691,
      excludedRows: 0,
      columns: ['element_name', 'module', 'click_count', 'page_pv'],
      warnings: [],
      elements: [
        { id: 'agent-models', name: '模型广场', clicks: 2135, pagePv: 21055, module: '核心体验', kind: 'CTA', share: 24.6 },
        { id: 'agent-experience', name: 'Agent 体验', clicks: 1290, pagePv: 21055, module: '核心体验', kind: 'CTA', share: 14.8 },
        { id: 'agent-try', name: '立即体验', clicks: 909, pagePv: 21055, module: '转化入口', kind: 'CTA', share: 10.5 },
        { id: 'agent-ai', name: 'AI 大模型', clicks: 874, pagePv: 21055, module: '全局导航', kind: '导航', share: 10.1 },
        { id: 'agent-key', name: '控制台 · API Key', clicks: 710, pagePv: 21055, module: '激活动作', kind: 'CTA', share: 8.2 },
        { id: 'agent-buy', name: '去购买', clicks: 343, pagePv: 21055, module: '转化入口', kind: 'CTA', share: 3.9 },
        { id: 'agent-auth', name: '立即注册/登录', clicks: 238, pagePv: 21055, module: '注册入口', kind: 'CTA', share: 2.7 },
        { id: 'agent-free', name: '免费注册', clicks: 236, pagePv: 21055, module: '注册入口', kind: 'CTA', share: 2.7 },
        { id: 'agent-login', name: '登录', clicks: 220, pagePv: 21055, module: '注册入口', kind: '导航', share: 2.5 },
        { id: 'agent-content', name: '一站式接入大模型能力', clicks: 222, pagePv: 21055, module: '内容说明', kind: '内容', share: 2.6 },
        { id: 'agent-faq', name: '常见问题', clicks: 205, pagePv: 21055, module: 'FAQ', kind: '内容', share: 2.4 },
        { id: 'agent-docs', name: '使用文档', clicks: 190, pagePv: 21055, module: '内容说明', kind: '内容', share: 2.2 },
      ],
    },
  },
  plan: {
    ...demoCaseMeta[1],
    device: '桌面端',
    primaryCta: '登录免费注册',
    notes: '演示案例：七牛 AI 订阅页，关注模型探索、套餐决策和注册承接。',
    heatmapName: 'ai-plan-heatmap.png',
    markedCtaIds: ['plan-auth', 'plan-month'],
    baseline: baseline.plan,
    behavior: {
      sourceName: '演示案例 · AI 订阅页',
      sourceType: 'csv',
      range: '2026-07-18 至 2026-07-24',
      pagePv: 3421,
      pageUv: undefined,
      clicks: 3443,
      excludedRows: 0,
      columns: ['element_name', 'module', 'click_count', 'page_pv'],
      warnings: [],
      elements: [
        { id: 'plan-expand', name: '展开全部模型', clicks: 963, pagePv: 3421, module: '模型发现', kind: 'CTA', share: 28.0 },
        { id: 'plan-deepseek', name: 'DeepSeek 模型卡', clicks: 327, pagePv: 3421, module: '模型发现', kind: '内容', share: 9.5 },
        { id: 'plan-nav-ai', name: 'AI 大模型（导航）', clicks: 293, pagePv: 3421, module: '全局导航', kind: '导航', share: 8.5 },
        { id: 'plan-month', name: '包月', clicks: 284, pagePv: 3421, module: '套餐周期', kind: 'CTA', share: 8.2 },
        { id: 'plan-moonshot', name: 'Moonshot AI 模型卡', clicks: 190, pagePv: 3421, module: '模型发现', kind: '内容', share: 5.5 },
        { id: 'plan-year', name: '包年', clicks: 177, pagePv: 3421, module: '套餐周期', kind: 'CTA', share: 5.1 },
        { id: 'plan-zhipu', name: '智谱 AI 模型卡', clicks: 169, pagePv: 3421, module: '模型发现', kind: '内容', share: 4.9 },
        { id: 'plan-quarter', name: '包季', clicks: 160, pagePv: 3421, module: '套餐周期', kind: 'CTA', share: 4.6 },
        { id: 'plan-key', name: 'API Key 统一接入多个模型系列', clicks: 125, pagePv: 3421, module: '权益说明', kind: '内容', share: 3.6 },
        { id: 'plan-auth', name: '登录免费注册', clicks: 95, pagePv: 3421, module: '转化入口', kind: 'CTA', share: 2.8 },
        { id: 'plan-console', name: '控制台', clicks: 57, pagePv: 3421, module: '全局导航', kind: '导航', share: 1.7 },
      ],
    },
  },
  activity: {
    ...demoCaseMeta[2],
    device: '桌面端',
    primaryCta: '查看优惠',
    notes: '演示案例：七牛春季活动页，关注活动聚合页的人群分流、权益解释和 CTA 归因。',
    heatmapName: 'spring-activity-heatmap.png',
    markedCtaIds: ['activity-buy-row'],
    baseline: baseline.activity,
    behavior: {
      sourceName: '演示案例 · 春季活动页',
      sourceType: 'csv',
      range: '2026-07-18 至 2026-07-24',
      pagePv: 7734,
      pageUv: undefined,
      clicks: 4338,
      excludedRows: 0,
      columns: ['element_name', 'module', 'click_count', 'page_pv'],
      warnings: ['存在同名元素且缺少模块/选择器，不能把它们归因为同一个页面位置。'],
      elements: [
        { id: 'activity-console', name: '控制台', clicks: 838, pagePv: 7734, module: '工具入口', kind: '导航', share: 19.3 },
        { id: 'activity-server', name: '云服务器', clicks: 317, pagePv: 7734, module: '产品专区', kind: '内容', share: 7.3 },
        { id: 'activity-ai', name: 'AI 大模型', clicks: 224, pagePv: 7734, module: '产品专区', kind: '内容', share: 5.2 },
        { id: 'activity-buy-row', name: '立即购买', clicks: 214, pagePv: 7734, module: '活动 CTA', kind: 'CTA', share: 4.9 },
        { id: 'activity-newcard', name: '新客专区活动卡', clicks: 209, pagePv: 7734, module: '活动专区', kind: '内容', share: 4.8 },
        { id: 'activity-token', name: 'Token Plan', clicks: 184, pagePv: 7734, module: '活动专区', kind: '内容', share: 4.2 },
        { id: 'activity-cdn', name: 'CDN 专区', clicks: 165, pagePv: 7734, module: '产品专区', kind: '内容', share: 3.8 },
        { id: 'activity-storage', name: '存储专区', clicks: 162, pagePv: 7734, module: '产品专区', kind: '内容', share: 3.7 },
        { id: 'activity-new', name: '新客专区', clicks: 154, pagePv: 7734, module: '活动专区', kind: '内容', share: 3.6 },
        { id: 'activity-flash', name: 'AI 推理限时秒杀', clicks: 131, pagePv: 7734, module: '活动专区', kind: 'CTA', share: 3.0 },
      ],
    },
  },
};

export async function loadDemoCase(id: DemoCaseId): Promise<DemoCase> {
  return structuredClone(demoCases[id]);
}
