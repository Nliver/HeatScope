'use client';

import { ArrowLeft, Check, CircleAlert, CopyPlus, Database, ExternalLink, FileCode2, Fingerprint, ImageIcon, LockKeyhole, MousePointerClick, Save } from '../../icons';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { readHistoryRecords, updateReviewConclusion, type HistoryRecord, type ReviewConclusion } from '../../../lib/history';
import { ConsoleShell } from '../../console-shell';
import { neutralizePreviewHtml } from '../../../lib/html-preview';
import { useHistoryRecordReuse } from '../history-reuse-controller';
import { InfoHint } from '../../ui-text';

const resultLabels: Record<ReviewConclusion['result'], string> = { met: '达到预期', partial: '部分达到', not_met: '未达到预期', unknown: '证据不足' };

export default function HistoryRecordPage() {
  const params = useParams<{ recordId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { requestReuse, reuseDialog } = useHistoryRecordReuse();
  const [record, setRecord] = useState<HistoryRecord>();
  const [loaded, setLoaded] = useState(false);
  const [activeModelId, setActiveModelId] = useState('');
  const [activeHtmlId, setActiveHtmlId] = useState('');
  const [reviewResult, setReviewResult] = useState<ReviewConclusion['result']>('unknown');
  const [reviewText, setReviewText] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const target = readHistoryRecords().find((item) => item.id === params.recordId);
    setRecord(target);
    setActiveModelId(target?.modelOutputs.find((item) => item.status === 'success')?.modelId || target?.modelOutputs[0]?.modelId || '');
    setActiveHtmlId(target?.adoptedBlueprint?.activeHtmlModelId || target?.adoptedBlueprint?.htmlDesigns.find((item) => item.status === 'success')?.modelId || '');
    setReviewResult(target?.reviewConclusion?.result || 'unknown');
    setReviewText(target?.reviewConclusion?.conclusion || '');
    setLoaded(true);
  }, [params.recordId]);

  const requestedReview = searchParams.get('mode') === 'review';
  const canReview = requestedReview && record?.meta.status === 'pending_review';
  const activeModel = useMemo(() => record?.modelOutputs.find((item) => item.modelId === activeModelId) || record?.modelOutputs[0], [activeModelId, record]);
  const activeHtml = useMemo(() => record?.adoptedBlueprint?.htmlDesigns.find((item) => item.modelId === activeHtmlId) || record?.adoptedBlueprint?.htmlDesigns[0], [activeHtmlId, record]);
  const previewHtml = useMemo(() => activeHtml?.output?.html ? neutralizePreviewHtml(activeHtml.output.html) : '', [activeHtml?.output?.html]);

  function submitReview() {
    if (!record || !canReview || !reviewText.trim()) { setSaveMessage('请先填写复盘结论。'); return; }
    try {
      const updated = updateReviewConclusion(record.id, { conclusion: reviewText.trim(), result: reviewResult, submittedAt: new Date().toISOString() });
      setRecord(updated);
      setSaveMessage('复盘结论已保存，诊断 checksum 保持一致。');
      router.replace(`/history/${encodeURIComponent(record.id)}?mode=view`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '复盘结论保存失败。');
    }
  }

  if (!loaded) return <ConsoleShell active="history"><main className="history-detail-state">正在读取历史快照…</main></ConsoleShell>;
  if (!record) return <ConsoleShell active="history"><main className="history-detail-state"><CircleAlert size={22} /><h1>历史快照不存在</h1><Link href="/history">返回历史记录</Link></main></ConsoleShell>;

  const input = record.inputSnapshot;
  return <ConsoleShell active="history"><main className="history-detail-page">
    <header className="history-detail-topbar">
      <Link href="/history"><ArrowLeft size={16} />历史记录</Link>
      <div className="history-readonly-label"><LockKeyhole size={14} />历史快照 · 只读</div>
      <button type="button" className="console-button" onClick={() => requestReuse(record)}><CopyPlus size={15} />复用数据重新分析</button>
    </header>
    <div className="history-detail-breadcrumb"><Link href="/history">历史记录</Link><span>/</span><strong>{record.meta.name}</strong></div>
    <section className="history-detail-hero">
      <div><span>{record.meta.status === 'pending_review' ? '待复盘快照' : '已完成快照'}</span><h1>{record.meta.name}</h1><p>{input.url || '旧记录未保存页面 URL'}</p></div>
      <dl>
        <div><dt>快照时间</dt><dd>{new Date(record.meta.snapshotAt).toLocaleString('zh-CN')}</dd></div>
        <div><dt>诊断阶段</dt><dd>Step {record.meta.stage} 固化结果</dd></div>
        <div><dt>模型输出</dt><dd>{record.meta.modelCount} 份</dd></div>
        <div><dt><Fingerprint size={13} />不可变校验</dt><dd><code>{record.diagnosisChecksum}</code></dd></div>
      </dl>
    </section>
    {record.legacyIncomplete && <div className="history-compat-warning"><CircleAlert size={16} /><span>旧版本迁移记录</span><InfoHint label="迁移记录说明">原系统未保存完整输入与模型输出；当前页面保持只读，不会回退到 Wizard 补写。</InfoHint></div>}

    <nav className="history-readonly-anchors" aria-label="快照内容索引"><span>输入快照</span><span>证据</span><span>模型结果</span><span>采用蓝图</span><span>复盘结论</span></nav>

    <section className="history-detail-section" id="snapshot-input">
      <header><div><span>01</span><h2>输入快照</h2></div><small>冻结字段</small></header>
      <dl className="history-input-grid">
        <div><dt>页面 URL</dt><dd>{input.url ? <a href={input.url} target="_blank" rel="noreferrer">{input.url}<ExternalLink size={13} /></a> : '未保存'}</dd></div>
        <div><dt>诊断目标</dt><dd>{input.goal}</dd></div>
        <div><dt>设备 / 受众</dt><dd>{input.device} · {input.audience}</dd></div>
        <div><dt>核心 CTA</dt><dd>{input.primaryCta || '未保存'}</dd></div>
        <div><dt>品牌变量</dt><dd><i style={{ background: input.brandColor }} />{input.brandColor} · {input.brandTone}</dd></div>
        <div><dt>行为数据</dt><dd>{input.behavior ? `${input.behavior.sourceName} · ${input.behavior.elements.length} 个元素` : '未保存'}</dd></div>
        <div className="wide"><dt>补充说明</dt><dd>{input.notes || '无'}</dd></div>
      </dl>
    </section>

    <section className="history-detail-section" id="snapshot-evidence">
      <header><div><span>02</span><h2>证据引用</h2></div><small>{record.evidenceRefs.length} 项</small></header>
      <div className="history-evidence-list">{record.evidenceRefs.length ? record.evidenceRefs.map((evidence) => <article key={evidence.id}><span>{evidence.kind === 'heatmap' ? <ImageIcon size={16} /> : evidence.kind === 'behavior' ? <Database size={16} /> : <MousePointerClick size={16} />}</span><div><b>{evidence.label}</b><p>{evidence.detail}</p></div></article>) : <p>无证据引用</p>}</div>
    </section>

    <section className="history-detail-section" id="snapshot-models">
      <header><div><span>03</span><h2>模型分析结果</h2></div><small>只读结果组件</small></header>
      {record.modelOutputs.length ? <><div className="history-model-tabs" role="tablist">{record.modelOutputs.map((result) => <button type="button" role="tab" aria-selected={activeModel?.modelId === result.modelId} className={activeModel?.modelId === result.modelId ? 'active' : ''} key={result.modelId} onClick={() => setActiveModelId(result.modelId)}><b>{result.modelName}</b><small>{result.status === 'success' ? `${result.latencyMs}ms` : '调用失败'}</small></button>)}</div>
        {activeModel && <article className="history-model-result"><header><div><b>{activeModel.modelName}</b><span>{activeModel.status === 'success' ? '分析完成' : '调用失败'}</span></div><p>{activeModel.output?.summary || activeModel.error || '无结构化结果'}</p></header><div>{activeModel.output?.insights?.map((insight, index) => <section key={`${activeModel.modelId}-${insight.id || index}`}><span>{insight.priority}</span><div><h3>{insight.title}</h3><p>{insight.action}</p><small>依据：{insight.evidence.join('；')}</small></div></section>)}</div></article>}
      </> : <p className="history-section-empty">无模型输出</p>}
    </section>

    <section className="history-detail-section" id="snapshot-blueprint">
      <header><div><span>04</span><h2>采用蓝图</h2></div><small>独立 HTML / 结构蓝图</small></header>
      {record.adoptedBlueprint?.htmlDesigns.length ? <><div className="history-model-tabs">{record.adoptedBlueprint.htmlDesigns.map((design) => <button type="button" className={activeHtml?.modelId === design.modelId ? 'active' : ''} key={design.modelId} onClick={() => setActiveHtmlId(design.modelId)}><b>{design.modelName}</b><small>{design.status === 'success' ? 'HTML 快照' : '生成失败'}</small></button>)}</div>{activeHtml?.status === 'success' && activeHtml.output?.html ? <div className="history-html-preview"><div><FileCode2 size={15} /><b>{activeHtml.modelName} · 独立 HTML</b></div><iframe title={`${activeHtml.modelName} 历史页面预览`} sandbox="" referrerPolicy="no-referrer" srcDoc={previewHtml} /></div> : <p className="history-section-empty">无可预览 HTML</p>}</> : record.adoptedBlueprint?.pageDesign ? <div className="history-blueprint-summary"><b>{record.adoptedBlueprint.pageDesign.strategy}</b><p>{record.adoptedBlueprint.pageDesign.desktop}</p><small>{record.adoptedBlueprint.pageDesign.sections.length} 个页面区块 · {record.adoptedBlueprint.pageDesign.events.length} 个事件建议</small></div> : <p className="history-section-empty">未生成 UI 蓝图</p>}
    </section>

    <section className="history-detail-section history-review-section" id="snapshot-review">
      <header><div><span>05</span><h2>复盘结论</h2></div><small>{canReview ? '唯一可写字段' : '只读'}</small></header>
      {canReview ? <div className="history-review-editor"><label><span>结果判断</span><select value={reviewResult} onChange={(event) => setReviewResult(event.target.value as ReviewConclusion['result'])}>{Object.entries(resultLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>复盘结论</span><textarea rows={6} value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="记录上线结果、证据口径、未达预期原因与后续动作。" /></label><div><InfoHint label="复盘保存说明">保存前后会校验 diagnosisChecksum；诊断输入、模型输出和蓝图禁止修改。</InfoHint><button type="button" onClick={submitReview}><Save size={15} />提交复盘结论</button></div></div> : record.reviewConclusion ? <div className="history-review-readonly"><span><Check size={15} />{resultLabels[record.reviewConclusion.result]}</span><p>{record.reviewConclusion.conclusion}</p><small>提交时间：{new Date(record.reviewConclusion.submittedAt).toLocaleString('zh-CN')}</small></div> : <p className="history-section-empty">暂无复盘结论</p>}
      {saveMessage && <p className="history-save-message" role="status">{saveMessage}</p>}
    </section>
    {reuseDialog}
  </main></ConsoleShell>;
}
