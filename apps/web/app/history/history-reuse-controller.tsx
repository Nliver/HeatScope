'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, KeyRound, RefreshCw, X } from '../icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  compareHistoryModelConfigs,
  createDiagnosisDraftFromHistory,
  modelConfigsForKeyRefresh,
  readWorkspaceModelConfigs,
  saveDiagnosisDraft,
  type HistoryModelConfigMatch,
  type HistoryRecord,
} from '../../lib/history';
import { InfoHint } from '../ui-text';

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const mismatchCopy: Record<Exclude<HistoryModelConfigMatch, 'match'>, { title: string; description: string }> = {
  mismatch: {
    title: '模型配置与历史快照不一致',
    description: '历史分析结果可以继续查看，但生成 HTML 前需要明确使用哪套 API 配置。API Key 不会在界面中显示。',
  },
  current_missing: {
    title: '当前模型配置已被清空',
    description: '历史快照保留了当时使用的模型配置。你可以沿用该配置，或清空历史密钥后重新填写。',
  },
  history_missing: {
    title: '历史快照没有可恢复的模型配置',
    description: '该快照未保存或未使用模型服务，无法恢复当时的 API Key。请使用当前配置继续，或先前往模型配置补齐服务。',
  },
};

function modelLabel(record: HistoryRecord) {
  const models = record.modelConfigSnapshot || [];
  if (!models.length) return '未保存模型配置';
  return models.map((model) => `${model.name} · ${model.model}`).join('；');
}

export function useHistoryRecordReuse() {
  const router = useRouter();
  const [pendingRecord, setPendingRecord] = useState<HistoryRecord>();
  const currentModels = pendingRecord ? readWorkspaceModelConfigs() : [];
  const match = pendingRecord ? compareHistoryModelConfigs(pendingRecord, currentModels) : 'match';
  const copy = match === 'match' ? undefined : mismatchCopy[match];

  function resume(record: HistoryRecord, models = readWorkspaceModelConfigs()) {
    const draft = createDiagnosisDraftFromHistory(record, createId());
    saveDiagnosisDraft(draft, { models });
    setPendingRecord(undefined);
    router.push(`/diagnosis/${draft.id}`);
  }

  function requestReuse(record: HistoryRecord) {
    const current = readWorkspaceModelConfigs();
    if (compareHistoryModelConfigs(record, current) === 'match') {
      resume(record, current);
      return;
    }
    setPendingRecord(record);
  }

  function reuseHistoricalConfiguration() {
    if (!pendingRecord?.modelConfigSnapshot?.length) return;
    resume(pendingRecord, structuredClone(pendingRecord.modelConfigSnapshot));
  }

  function reconfigureModels() {
    if (!pendingRecord) return;
    const draft = createDiagnosisDraftFromHistory(pendingRecord, createId());
    const refreshModels = modelConfigsForKeyRefresh(pendingRecord);
    saveDiagnosisDraft(draft, { models: refreshModels.length ? refreshModels : currentModels });
    setPendingRecord(undefined);
    router.push(`/models?configure=1&resumeDraft=${encodeURIComponent(draft.id)}`);
  }

  function continueWithCurrentConfiguration() {
    if (!pendingRecord || !currentModels.length) return;
    resume(pendingRecord, currentModels);
  }

  const reuseDialog = <Dialog.Root open={Boolean(pendingRecord)} onOpenChange={(open) => { if (!open) setPendingRecord(undefined); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="history-reuse-overlay" />
      <Dialog.Content className="history-reuse-dialog" aria-describedby="history-reuse-description">
        <header>
          <span><AlertTriangle size={18} /></span>
          <div><Dialog.Title>{copy?.title || '确认复用历史数据'}</Dialog.Title><Dialog.Description id="history-reuse-description">{copy?.description}</Dialog.Description><InfoHint label="模型配置比较说明">配置随诊断 checksum 冻结；系统只比较配置指纹，不展示或记录明文 API Key，密钥仅保存在浏览器本地。</InfoHint></div>
          <Dialog.Close asChild><button type="button" className="dialog-close" aria-label="关闭模型配置确认"><X size={17} /></button></Dialog.Close>
        </header>
        {pendingRecord && <div className="history-reuse-comparison">
          <section><span>历史快照</span><b>{pendingRecord.modelConfigSnapshot?.length || 0} 个模型</b><p>{modelLabel(pendingRecord)}</p></section>
          <section><span>当前工作区</span><b>{currentModels.length} 个模型</b><p>{currentModels.length ? currentModels.map((model) => `${model.name} · ${model.model}`).join('；') : '当前没有可用模型配置'}</p></section>
        </div>}
        <div className="history-reuse-actions">
          <Dialog.Close asChild><button type="button" className="console-button">取消</button></Dialog.Close>
          {match === 'history_missing' && currentModels.length > 0 && <button type="button" className="console-button" onClick={continueWithCurrentConfiguration}>使用当前配置继续</button>}
          <button type="button" className="console-button" onClick={reconfigureModels}><RefreshCw size={15} />重新配置</button>
          {match !== 'history_missing' && <button type="button" className="console-button primary" onClick={reuseHistoricalConfiguration}><KeyRound size={15} />沿用历史配置</button>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;

  return { requestReuse, reuseDialog };
}
