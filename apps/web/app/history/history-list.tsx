'use client';

import { ArrowRight, CheckCircle2, Clock3, CopyPlus, Eye, FileArchive, RotateCcw, TrashCan } from '../icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearHistoryRecords, deleteHistoryRecord, readHistoryRecords, type HistoryRecord } from '../../lib/history';
import { ConfirmDialog } from '../confirm-dialog';
import { useHistoryRecordReuse } from './history-reuse-controller';

type DeleteTarget = { kind: 'record'; record: HistoryRecord } | { kind: 'all' };

function statusLabel(record: HistoryRecord) {
  return record.meta.status === 'completed' ? '已完成' : record.meta.status === 'pending_review' ? '待复盘' : '分析中';
}

export default function HistoryList() {
  const router = useRouter();
  const { requestReuse, reuseDialog } = useHistoryRecordReuse();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();

  useEffect(() => {
    setRecords(readHistoryRecords().slice().sort((left, right) => right.meta.snapshotAt.localeCompare(left.meta.snapshotAt)));
    setHydrated(true);
  }, []);

  function openRecord(recordId: string, mode: 'view' | 'review' = 'view') {
    router.push(`/history/${encodeURIComponent(recordId)}?mode=${mode}`);
  }

  function exportRecords() {
    const csv = ['任务名称,目标,快照时间,状态,模型数,校验值', ...records.map((record) => [record.meta.name, record.meta.goal, record.meta.snapshotAt, statusLabel(record), record.meta.modelCount, record.diagnosisChecksum].join(','))].join('\n');
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = 'heatscope-history.csv';
    link.click();
    URL.revokeObjectURL(href);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'all') {
      clearHistoryRecords();
      setRecords([]);
      return;
    }
    setRecords(deleteHistoryRecord(deleteTarget.record.id).slice().sort((left, right) => right.meta.snapshotAt.localeCompare(left.meta.snapshotAt)));
  }

  return <div className="history-route-page">
    <header className="history-route-head">
      <div><span>历史记录</span><h1>诊断快照</h1></div>
      <div className="history-route-actions"><button type="button" className="console-button" disabled={!records.length} onClick={exportRecords}><FileArchive size={15} />导出记录</button><button type="button" className="console-button danger" disabled={!records.length} onClick={() => setDeleteTarget({ kind: 'all' })}><TrashCan size={15} />清空全部</button></div>
    </header>
    <section className="history-summary-strip" aria-label="历史记录概览">
      <div><CheckCircle2 size={17} /><span><b>{records.filter((record) => record.meta.status === 'completed').length}</b> 已完成</span></div>
      <div><Clock3 size={17} /><span><b>{records.filter((record) => record.meta.status === 'pending_review').length}</b> 待复盘</span></div>
      <div><RotateCcw size={17} /><span><b>{records.length}</b> 固化快照</span></div>
    </section>
    <div className="history-panel history-record-table">
      {hydrated && records.length ? <table>
        <thead><tr><th>任务名称</th><th>目标</th><th>快照时间</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{records.map((record) => {
          const pending = record.meta.status === 'pending_review';
          return <tr key={record.id} role="row" tabIndex={0} className="history-clickable-row" onClick={() => openRecord(record.id)} onKeyDown={(event) => { if (event.key === 'Enter') openRecord(record.id); }}>
            <td><b>{record.meta.name}</b><small>{record.meta.modelCount ? `${record.meta.modelCount} 个模型输出 · ${record.evidenceRefs.length} 条证据` : `${record.evidenceRefs.length} 条证据 · 本地规则快照`}</small></td>
            <td>{record.meta.goal}</td>
            <td>{new Date(record.meta.snapshotAt).toLocaleString('zh-CN')}</td>
            <td><span className={`history-status ${pending ? 'pending' : ''}`}>{statusLabel(record)}</span></td>
            <td><div className="history-row-actions">
              <button type="button" className="table-action" onClick={(event) => { event.stopPropagation(); openRecord(record.id); }}><Eye size={14} />查看</button>
              {pending && <button type="button" className="table-action review" onClick={(event) => { event.stopPropagation(); openRecord(record.id, 'review'); }}><ArrowRight size={14} />继续复盘</button>}
              <button type="button" className="table-action muted" onClick={(event) => { event.stopPropagation(); requestReuse(record); }}><CopyPlus size={14} />复用数据</button>
              <button type="button" className="table-action danger" onClick={(event) => { event.stopPropagation(); setDeleteTarget({ kind: 'record', record }); }}><TrashCan size={14} />删除</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table> : <div className="history-empty"><Clock3 size={19} /><b>{hydrated ? '暂无历史快照' : '正在读取历史记录'}</b></div>}
    </div>
    {reuseDialog}
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} title={deleteTarget?.kind === 'all' ? '清空全部历史记录？' : '删除这条历史记录？'} description={deleteTarget?.kind === 'all' ? `将永久删除当前 ${records.length} 条诊断快照，此操作无法撤销。` : `“${deleteTarget?.record.meta.name || ''}”的诊断快照、模型输出和复盘结论都会被删除。`} confirmLabel={deleteTarget?.kind === 'all' ? '确认清空' : '确认删除'} onConfirm={confirmDelete} />
  </div>;
}
