import type { GeneratedPageDesign, Goal, HtmlDesignResult, LocalAnalysis, ModelConfig, ModelResult, PageBaseline } from './api';
import type { ImportedClicks } from './csv';

export const HISTORY_STORAGE_KEY = 'heatscope.history.v2';
export const LEGACY_HISTORY_STORAGE_KEY = 'heatscope.history.v1';
export const HISTORY_UPDATED_EVENT = 'heatscope:history-updated';
export const WORKSPACE_STORAGE_KEY = 'heatscope.workspace.v3';
export const DRAFT_STORAGE_KEY = 'heatscope.drafts.v1';
// Keep history below the browser's per-origin quota. Other workspace keys share
// the same bucket, so this is intentionally lower than the usual 5 MB limit.
export const HISTORY_SAFE_LIMIT = 1_400_000;

export type HistoryStatus = 'running' | 'pending_review' | 'completed';

export type HistoryInputSnapshot = {
  url: string;
  goal: Goal;
  device: string;
  audience: '2B' | '2C' | '2G' | '混合';
  brandColor: string;
  brandTone: string;
  primaryCta: string;
  notes: string;
  pageBaseline?: PageBaseline;
  behavior?: ImportedClicks;
  heatmapName: string;
  heatmapDataUrl?: string;
  includeHeatmapInModel: boolean;
  markedCtas: string[];
  heatmapCoordinates: Record<string, string>;
};

export type EvidenceRef = {
  id: string;
  kind: 'url' | 'heatmap' | 'behavior' | 'coordinate';
  label: string;
  detail: string;
};

export type AdoptedBlueprint = {
  pageDesign?: GeneratedPageDesign;
  htmlDesigns: HtmlDesignResult[];
  activeHtmlModelId: string;
  uiPrompt: string;
};

export type ReviewConclusion = {
  conclusion: string;
  result: 'met' | 'partial' | 'not_met' | 'unknown';
  submittedAt: string;
};

export type HistoryRecord = {
  id: string;
  inputSnapshot: HistoryInputSnapshot;
  /** Non-secret model configuration snapshot. API keys are deliberately excluded. */
  modelConfigSnapshot?: Array<Omit<ModelConfig, 'apiKey'>>;
  localOutput?: LocalAnalysis;
  modelOutputs: ModelResult[];
  adoptedBlueprint?: AdoptedBlueprint;
  evidenceRefs: EvidenceRef[];
  meta: {
    name: string;
    goal: Goal;
    createdAt: string;
    snapshotAt: string;
    status: HistoryStatus;
    modelCount: number;
    stage: 1 | 2 | 3 | 4;
  };
  diagnosisChecksum: string;
  /** Checksum of the complete snapshot before storage-only compaction. */
  sourceDiagnosisChecksum?: string;
  reviewConclusion?: ReviewConclusion;
  legacyIncomplete?: boolean;
};

export type DiagnosisDraft = {
  id: string;
  createdAt: string;
  sourceHistoryId?: string;
  inputSnapshot: HistoryInputSnapshot;
  resumeAnalysis?: {
    localOutput?: LocalAnalysis;
    modelOutputs: ModelResult[];
    selectedModelIds: string[];
  };
  comparisonBaseline?: {
    recordId: string;
    name: string;
    snapshotAt: string;
    diagnosisChecksum: string;
  };
};

type LegacyHistoryRecord = {
  id: string;
  name: string;
  url: string;
  goal: Goal;
  updatedAt: string;
  status: HistoryStatus;
  modelCount: number;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stableValue(entry)]));
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function computeDiagnosisChecksum(record: Pick<HistoryRecord, 'inputSnapshot' | 'modelConfigSnapshot' | 'localOutput' | 'modelOutputs' | 'adoptedBlueprint' | 'evidenceRefs'>) {
  return hashText(JSON.stringify(stableValue({
    inputSnapshot: record.inputSnapshot,
    modelConfigSnapshot: record.modelConfigSnapshot,
    localOutput: record.localOutput,
    modelOutputs: record.modelOutputs,
    adoptedBlueprint: record.adoptedBlueprint,
    evidenceRefs: record.evidenceRefs,
  })));
}

export function withDiagnosisChecksum(record: Omit<HistoryRecord, 'diagnosisChecksum'>): HistoryRecord {
  return { ...record, diagnosisChecksum: computeDiagnosisChecksum(record) };
}

export function isFrozenHistoryRecord(record: HistoryRecord) {
  return record.meta.status === 'pending_review' || record.meta.status === 'completed';
}

function migrateLegacyRecord(record: LegacyHistoryRecord): HistoryRecord {
  const snapshotAt = record.updatedAt || new Date().toISOString();
  return withDiagnosisChecksum({
    id: record.id,
    inputSnapshot: {
      url: record.url || '',
      goal: record.goal || '注册/试用',
      device: '未知',
      audience: '混合',
      brandColor: '#0A9C8A',
      brandTone: '历史记录未保存',
      primaryCta: '历史记录未保存',
      notes: '',
      heatmapName: '',
      includeHeatmapInModel: false,
      markedCtas: [],
      heatmapCoordinates: {},
    },
    modelOutputs: [],
    evidenceRefs: record.url ? [{ id: 'legacy-url', kind: 'url', label: '页面 URL', detail: record.url }] : [],
    meta: {
      name: record.name || '未命名历史记录',
      goal: record.goal || '注册/试用',
      createdAt: snapshotAt,
      snapshotAt,
      status: record.status || 'completed',
      modelCount: record.modelCount || 0,
      stage: record.status === 'running' ? 1 : 2,
    },
    legacyIncomplete: true,
  });
}

function isHistoryRecord(value: unknown): value is HistoryRecord {
  return Boolean(value && typeof value === 'object' && 'inputSnapshot' in value && 'diagnosisChecksum' in value && 'meta' in value);
}

export function readHistoryRecords(): HistoryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (current) return (JSON.parse(current) as unknown[]).map((record) => isHistoryRecord(record) ? record : migrateLegacyRecord(record as LegacyHistoryRecord));
    const legacy = window.localStorage.getItem(LEGACY_HISTORY_STORAGE_KEY);
    return legacy ? (JSON.parse(legacy) as LegacyHistoryRecord[]).map(migrateLegacyRecord) : [];
  } catch {
    return [];
  }
}

function assertFrozenRecordUnchanged(previous: HistoryRecord, next: HistoryRecord) {
  if (!isFrozenHistoryRecord(previous)) return;
  const currentChecksum = computeDiagnosisChecksum(next);
  const previousSourceChecksum = previous.sourceDiagnosisChecksum || previous.diagnosisChecksum;
  const nextSourceChecksum = next.sourceDiagnosisChecksum || currentChecksum;
  if (previousSourceChecksum !== nextSourceChecksum || next.diagnosisChecksum !== currentChecksum) {
    throw new Error('历史快照已冻结，只允许更新复盘结论和状态。');
  }
}

type HistoryStorageLevel = 0 | 1 | 2 | 3 | 4;

function compactModelResult(result: ModelResult): ModelResult {
  return {
    ...result,
    output: result.output ? {
      ...result.output,
      insights: result.output.insights.slice(0, 8).map((insight) => ({
        ...insight,
        evidence: Array.isArray(insight.evidence) ? insight.evidence.slice(0, 4) : [],
      })),
    } : undefined,
  };
}

function compactHtmlResult(result: HtmlDesignResult): HtmlDesignResult {
  return {
    ...result,
    output: result.output ? { ...result.output, html: '' } : undefined,
  };
}

function compactHistoryRecord(record: HistoryRecord, level: HistoryStorageLevel): HistoryRecord {
  if (level === 0) return { ...record, sourceDiagnosisChecksum: record.sourceDiagnosisChecksum || record.diagnosisChecksum };
  const sourceDiagnosisChecksum = record.sourceDiagnosisChecksum || computeDiagnosisChecksum(record);
  const inputSnapshot = {
    ...record.inputSnapshot,
    heatmapDataUrl: undefined,
    ...(level >= 2 ? { behavior: undefined } : {}),
  };
  const adoptedBlueprint = record.adoptedBlueprint ? {
    ...record.adoptedBlueprint,
    ...(level >= 2 ? {
      htmlDesigns: record.adoptedBlueprint.htmlDesigns.map(compactHtmlResult),
    } : {}),
    ...(level >= 3 ? { pageDesign: record.adoptedBlueprint.pageDesign ? { ...record.adoptedBlueprint.pageDesign, renderHtml: undefined } : undefined } : {}),
  } : undefined;
  const compacted: Omit<HistoryRecord, 'diagnosisChecksum'> = {
    ...record,
    inputSnapshot,
    localOutput: level >= 4
      ? record.localOutput ? { ...record.localOutput, insights: record.localOutput.insights.slice(0, 4), blueprint: { ...record.localOutput.blueprint, modules: [], events: [] } } : undefined
      : level >= 3 && record.localOutput ? { ...record.localOutput, insights: record.localOutput.insights.slice(0, 12) } : record.localOutput,
    modelOutputs: level >= 4
      ? record.modelOutputs.map(({ modelId, modelName, status, latencyMs, error }) => ({ modelId, modelName, status, latencyMs, error }))
      : level >= 2 ? record.modelOutputs.map(compactModelResult) : record.modelOutputs,
    adoptedBlueprint: level >= 4 && adoptedBlueprint ? { activeHtmlModelId: adoptedBlueprint.activeHtmlModelId, uiPrompt: adoptedBlueprint.uiPrompt, htmlDesigns: [] } : adoptedBlueprint,
    sourceDiagnosisChecksum,
  };
  return { ...compacted, diagnosisChecksum: computeDiagnosisChecksum(compacted) };
}

function prepareHistoryRecords(records: HistoryRecord[], level: HistoryStorageLevel) {
  return records.map((record) => compactHistoryRecord(record, level));
}

export function isHistoryQuotaError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'QuotaExceededError')
    || /quota|storage.*full|exceeded the quota/i.test(error instanceof Error ? error.message : String(error));
}

export type HistoryWriteResult = { persisted: boolean; degraded: boolean; bytes: number };

export function writeHistoryRecords(records: HistoryRecord[]): HistoryWriteResult | undefined {
  if (typeof window === 'undefined') return;
  const previousRecords = readHistoryRecords();
  const levels: HistoryStorageLevel[] = [0, 1, 2, 3, 4];
  let lastError: unknown;
  for (const level of levels) {
    const prepared = prepareHistoryRecords(records, level);
    const previousById = new Map(previousRecords.map((record) => [record.id, record]));
    try {
      prepared.forEach((record) => {
        const previous = previousById.get(record.id);
        if (previous) assertFrozenRecordUnchanged(previous, record);
        if (record.diagnosisChecksum !== computeDiagnosisChecksum(record)) throw new Error('历史快照校验失败，已拒绝写入。');
      });
      const serialized = JSON.stringify(prepared);
      if (serialized.length > HISTORY_SAFE_LIMIT) {
        lastError = new Error('历史快照体积过大，需要压缩保存。');
        continue;
      }
      window.localStorage.setItem(HISTORY_STORAGE_KEY, serialized);
      window.dispatchEvent(new CustomEvent(HISTORY_UPDATED_EVENT, { detail: { count: records.length } }));
      return { persisted: true, degraded: level > 0, bytes: serialized.length };
    } catch (error) {
      if (!isHistoryQuotaError(error) && level === 0) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('浏览器本地存储空间不足，历史快照未能保存。');
}

export function deleteHistoryRecord(recordId: string) {
  const next = readHistoryRecords().filter((record) => record.id !== recordId);
  writeHistoryRecords(next);
  return next;
}

export function clearHistoryRecords() {
  writeHistoryRecords([]);
}

export function updateReviewConclusion(recordId: string, conclusion: ReviewConclusion) {
  const records = readHistoryRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) throw new Error('历史记录不存在。');
  const checksumBefore = record.diagnosisChecksum;
  const next: HistoryRecord = { ...record, reviewConclusion: conclusion, meta: { ...record.meta, status: 'completed' } };
  if (computeDiagnosisChecksum(next) !== checksumBefore) throw new Error('诊断字段发生变化，复盘结论未保存。');
  writeHistoryRecords(records.map((item) => item.id === recordId ? next : item));
  return next;
}

type ComparableModelConfig = Pick<ModelConfig, 'id' | 'name' | 'baseUrl' | 'model' | 'protocol' | 'reasoningEffort' | 'timeoutSeconds' | 'enabled'>;

function comparableModelConfig(model: Pick<ModelConfig, 'id' | 'name' | 'baseUrl' | 'model' | 'protocol' | 'reasoningEffort' | 'timeoutSeconds' | 'enabled'>): ComparableModelConfig {
  return {
    id: model.id,
    name: model.name.trim(),
    baseUrl: model.baseUrl.trim().replace(/\/+$/, ''),
    model: model.model.trim(),
    protocol: model.protocol,
    reasoningEffort: model.reasoningEffort,
    timeoutSeconds: model.timeoutSeconds,
    enabled: model.enabled,
  };
}

export function readWorkspaceModelConfigs(): ModelConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const workspace = JSON.parse(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || '{}') as { models?: ModelConfig[] };
    return Array.isArray(workspace.models) ? workspace.models : [];
  } catch {
    return [];
  }
}

export function modelConfigFingerprint(models: Array<Pick<ModelConfig, 'id' | 'name' | 'baseUrl' | 'model' | 'protocol' | 'reasoningEffort' | 'timeoutSeconds' | 'enabled'>>) {
  const comparable = models.map(comparableModelConfig).sort((left, right) => left.id.localeCompare(right.id));
  return hashText(JSON.stringify(stableValue(comparable)));
}

export type HistoryModelConfigMatch = 'match' | 'mismatch' | 'current_missing' | 'history_missing';

export function compareHistoryModelConfigs(record: HistoryRecord, currentModels = readWorkspaceModelConfigs()): HistoryModelConfigMatch {
  const historicalModels = record.modelConfigSnapshot;
  if (!historicalModels?.length) return 'history_missing';
  if (!currentModels.length) return 'current_missing';
  if (currentModels.some((model) => !model.apiKey.trim())) return 'current_missing';
  return modelConfigFingerprint(historicalModels) === modelConfigFingerprint(currentModels) ? 'match' : 'mismatch';
}

export function modelConfigsForKeyRefresh(record: HistoryRecord) {
  return (record.modelConfigSnapshot || []).map((model) => ({
    ...structuredClone(model),
    apiKey: '',
    connectionStatus: 'untested' as const,
    connectionError: undefined,
    connectionLatencyMs: undefined,
  }));
}

export function createDiagnosisDraftFromHistory(record: HistoryRecord, draftId: string): DiagnosisDraft {
  const hasAnalysis = record.modelOutputs.length > 0 || Boolean(record.localOutput) || record.meta.stage >= 2;
  return {
    id: draftId,
    createdAt: new Date().toISOString(),
    sourceHistoryId: record.id,
    inputSnapshot: structuredClone(record.inputSnapshot),
    resumeAnalysis: hasAnalysis ? {
      localOutput: record.localOutput ? structuredClone(record.localOutput) : undefined,
      modelOutputs: structuredClone(record.modelOutputs),
      selectedModelIds: record.modelOutputs.filter((item) => item.status === 'success').map((item) => item.modelId),
    } : undefined,
    comparisonBaseline: {
      recordId: record.id,
      name: record.meta.name,
      snapshotAt: record.meta.snapshotAt,
      diagnosisChecksum: record.diagnosisChecksum,
    },
  };
}

export function saveDiagnosisDraft(draft: DiagnosisDraft, options: { models?: ModelConfig[] } = {}) {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  const drafts = raw ? JSON.parse(raw) as DiagnosisDraft[] : [];
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify([draft, ...drafts.filter((item) => item.id !== draft.id)].slice(0, 30)));
  const existingWorkspace = (() => {
    try { return JSON.parse(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || '{}') as { models?: unknown[]; uiPrompt?: string }; } catch { return {}; }
  })();
  const input = draft.inputSnapshot;
  const resume = draft.resumeAnalysis;
  const modelOutputs = resume?.modelOutputs || [];
  const selectedModelId = modelOutputs.find((item) => item.status === 'success')?.modelId || '';
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
    draftId: draft.id,
    comparisonBaseline: draft.comparisonBaseline,
    url: input.url,
    goal: input.goal,
    device: input.device,
    audience: input.audience,
    brandColor: input.brandColor,
    brandTone: input.brandTone,
    primaryCta: input.primaryCta,
    notes: input.notes,
    pageBaseline: input.pageBaseline,
    behavior: input.behavior,
    heatmapName: input.heatmapName,
    heatmapDataUrl: input.heatmapDataUrl || '',
    includeHeatmapInModel: input.includeHeatmapInModel,
    markedCtas: input.markedCtas,
    models: structuredClone(options.models ?? existingWorkspace.models ?? []),
    local: resume?.localOutput,
    results: modelOutputs,
    selectedModelId,
    uiPrompt: existingWorkspace.uiPrompt || '',
    htmlDesigns: [],
    selectedHtmlModelIds: resume?.selectedModelIds || [],
    htmlJobs: [],
    heatmapCoordinates: input.heatmapCoordinates,
    currentStep: resume ? 1 : 0,
    evidenceConfirmed: Boolean(resume),
  }));
}
