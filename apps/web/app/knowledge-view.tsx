'use client';

import { ArrowLeft, ArrowRight, CheckmarkFilled, Database, FileSpreadsheet, Pencil, Plus, Save, Sparkles, TrashCan, X } from './icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelConfig } from '../lib/api';
import { formatProviderError, runKnowledgeSynthesis, type KnowledgeSynthesisResult } from '../lib/api';
import { createKnowledgeEntry, createKnowledgeSource, readKnowledgeLibrary, saveKnowledgeEntryToSource, updateKnowledgeSource, writeKnowledgeLibrary, type KnowledgeEntry, type KnowledgeLibrary, type KnowledgeSeverity, type KnowledgeSource, type KnowledgeSourceType } from '../lib/knowledge';
import { ConfirmDialog } from './confirm-dialog';
import { InfoHint } from './ui-text';

type Props = { models: ModelConfig[]; onOpenModels(): void };
type ImportDraft = { title: string; sourceType: 'operation_doc' | 'analysis_case'; text: string; fileName: string };
type EditorState = Partial<KnowledgeEntry> & { title: string };
type SourceEditorState = { id?: string; title: string; summary: string };
type DeleteTarget = { kind: 'entry'; entry: KnowledgeEntry } | { kind: 'source'; source: KnowledgeSource } | { kind: 'all' };

const ENTRIES_PER_PAGE = 10;
const severityOptions: KnowledgeSeverity[] = ['P0', 'P1', 'P2'];
const sourceLabels: Record<KnowledgeSourceType, string> = { mother_case: '母版案例', operation_doc: '运营文档', analysis_case: '分析案例', manual: '手工规则' };

function emptyEditor(): EditorState { return { title: '', category: '待分类', severity: 'P1', principle: '', evidence: '', action: '', validation: '', guardrail: '', tags: [], source: '手工新增', enabled: true }; }
function entryToEditor(entry: KnowledgeEntry): EditorState { return { ...entry, tags: [...entry.tags] }; }
function formatDate(value: string) { try { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)); } catch { return '刚刚'; } }
function sourceTitle(type: ImportDraft['sourceType']) { return type === 'analysis_case' ? '导入分析案例' : '导入运营文档'; }

export default function KnowledgeView({ models, onOpenModels }: Props) {
  const [library, setLibrary] = useState<KnowledgeLibrary>(() => readKnowledgeLibrary());
  const [selectedSourceId, setSelectedSourceId] = useState('mother-case');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>();
  const [editorSourceId, setEditorSourceId] = useState('');
  const [sourceEditor, setSourceEditor] = useState<SourceEditorState>();
  const [importOpen, setImportOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<ImportDraft>({ title: '', sourceType: 'operation_doc', text: '', fileName: '' });
  const [importBusy, setImportBusy] = useState(false);
  const [synthesisModelId, setSynthesisModelId] = useState('');
  const [synthesisBusy, setSynthesisBusy] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<KnowledgeSynthesisResult>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const importInputRef = useRef<HTMLInputElement>(null);
  const entryListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { writeKnowledgeLibrary(library); }, [library]);
  useEffect(() => { if (!library.sources.some((source) => source.id === selectedSourceId)) setSelectedSourceId(library.sources[0]?.id || 'mother-case'); }, [library.sources, selectedSourceId]);

  const selectedSource = library.sources.find((source) => source.id === selectedSourceId);
  const sourceEntries = useMemo(() => library.entries.filter((entry) => selectedSource?.entryIds.includes(entry.id)), [library.entries, selectedSource]);
  const visibleEntries = useMemo(() => sourceEntries.filter((entry) => {
    const text = `${entry.title} ${entry.category} ${entry.principle} ${entry.tags.join(' ')}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }), [query, sourceEntries]);
  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / ENTRIES_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageEntries = visibleEntries.slice((currentPage - 1) * ENTRIES_PER_PAGE, currentPage * ENTRIES_PER_PAGE);
  const selectedEntry = sourceEntries.find((entry) => entry.id === selectedEntryId);
  const sourceBeingEdited = sourceEditor?.id ? library.sources.find((source) => source.id === sourceEditor.id) : undefined;
  const connectedModels = models.filter((model) => model.enabled && Boolean(model.apiKey.trim()) && model.connectionStatus === 'success');
  const enabledCount = library.entries.filter((entry) => entry.enabled).length;

  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);

  function announce(message: string) { setNotice(message); setError(''); window.setTimeout(() => setNotice((current) => current === message ? '' : current), 4200); }
  function chooseSource(id: string) { setSelectedSourceId(id); setSelectedEntryId(''); setQuery(''); setPage(1); entryListRef.current?.scrollTo({ top: 0 }); }
  function changePage(nextPage: number) { const bounded = Math.max(1, Math.min(nextPage, pageCount)); setPage(bounded); setSelectedEntryId(''); entryListRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }
  function openNewEntry(sourceId = selectedSourceId) { if (!library.sources.some((source) => source.id === sourceId)) { setError('请先新建或选择一个规则库。'); return; } setEditorSourceId(sourceId); setEditor(emptyEditor()); }
  function openEntryEditor(entry: KnowledgeEntry) { const sourceId = library.sources.find((source) => source.entryIds.includes(entry.id))?.id || selectedSourceId; setEditorSourceId(sourceId); setEditor(entryToEditor(entry)); }
  function updateEntry(entryId: string, updates: Partial<KnowledgeEntry>) { setLibrary((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, ...updates, updatedAt: new Date().toISOString() } : entry) })); }
  function saveEntry(event: React.FormEvent) { event.preventDefault(); if (!editor?.title?.trim()) { setError('规则标题不能为空。'); return; } const targetSource = library.sources.find((source) => source.id === editorSourceId); if (!targetSource) { setError('请选择规则所属的规则库。'); return; } const existing = editor.id ? library.entries.find((entry) => entry.id === editor.id) : undefined; const previousSourceId = existing ? library.sources.find((source) => source.entryIds.includes(existing.id))?.id : undefined; const next = createKnowledgeEntry({ ...editor, title: editor.title.trim(), source: targetSource.title, tags: (editor.tags || []).flatMap((tag) => tag.split(',').map((value) => value.trim()).filter(Boolean)) }); setLibrary((current) => saveKnowledgeEntryToSource(current, next, targetSource.id, previousSourceId)); setSelectedSourceId(targetSource.id); if (!existing) setSelectedEntryId(''); setEditor(undefined); setEditorSourceId(''); announce(existing ? '规则已保存，后续诊断会读取最新版本。' : `新规则已加入“${targetSource.title}”。`); }
  function saveSource(event: React.FormEvent) { event.preventDefault(); if (!sourceEditor?.title.trim()) { setError('规则库名称不能为空。'); return; } if (sourceEditor.id) { setLibrary((current) => updateKnowledgeSource(current, sourceEditor.id!, { title: sourceEditor.title, summary: sourceEditor.summary })); announce('规则库信息已更新。'); } else { const source = createKnowledgeSource({ title: sourceEditor.title, summary: sourceEditor.summary }); setLibrary((current) => ({ ...current, sources: [...current.sources, source] })); setSelectedSourceId(source.id); setSelectedEntryId(''); setQuery(''); announce(`规则库“${source.title}”已创建，现在可以在其中新增规则。`); } setSourceEditor(undefined); }
  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'all') {
      setLibrary((current) => ({ ...current, entries: [], sources: current.sources.map((source) => ({ ...source, entryIds: [] })) }));
      setSelectedEntryId(''); setPage(1); announce('全部具体规则已清空，规则库结构已保留。'); return;
    }
    if (deleteTarget.kind === 'source') {
      const removedIds = new Set(deleteTarget.source.entryIds);
      const remainingSources = library.sources.filter((source) => source.id !== deleteTarget.source.id);
      setLibrary((current) => ({ ...current, entries: current.entries.filter((entry) => !removedIds.has(entry.id)), sources: current.sources.filter((source) => source.id !== deleteTarget.source.id) }));
      if (selectedSourceId === deleteTarget.source.id) setSelectedSourceId(remainingSources[0]?.id || '');
      setSelectedEntryId(''); setSourceEditor(undefined); setPage(1); announce(`规则库“${deleteTarget.source.title}”及其规则已删除。`); return;
    }
    const entryId = deleteTarget.entry.id;
    setLibrary((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== entryId), sources: current.sources.map((source) => ({ ...source, entryIds: source.entryIds.filter((id) => id !== entryId) })) }));
    setSelectedEntryId(''); announce(`规则“${deleteTarget.entry.title}”已删除。`);
  }
  async function readImportFile(file: File) {
    setImportBusy(true); setError('');
    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.docx')) {
        // mammoth's browser build extracts the document body without uploading the source file.
        // @ts-expect-error mammoth does not publish browser-build TypeScript declarations.
        const mammoth = await import('mammoth/mammoth.browser');
        const result = await mammoth.default.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        text = result.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } else text = await file.text();
      if (!text.trim()) throw new Error('文件中没有可读取的正文。');
      setImportDraft((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ''), fileName: file.name, text: text.slice(0, 120000) }));
      announce(`已读取 ${file.name}，请检查标题和正文后导入。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '文档读取失败。'); } finally { setImportBusy(false); }
  }
  function importSource(event: React.FormEvent) { event.preventDefault(); if (!importDraft.title.trim() || !importDraft.text.trim()) { setError('请补充来源标题和正文。'); return; } const sourceId = `source-${Date.now()}`; const entry = createKnowledgeEntry({ title: `${importDraft.title.trim()} · 原文参考`, category: '待归纳资料', severity: 'P1', principle: importDraft.text.slice(0, 420), evidence: `来源：${importDraft.fileName || '粘贴内容'}`, action: '选择已连接模型，在“AI 归纳”中把这份资料提炼为可复用原则。', validation: '归纳后为每条原则补充目标事件、页面版本和观察窗口。', guardrail: '原始资料未经归纳时，不应作为硬性页面改版结论。', tags: ['待归纳'], source: importDraft.title.trim(), enabled: false }); const source = { id: sourceId, title: importDraft.title.trim(), type: importDraft.sourceType as KnowledgeSourceType, summary: `${sourceLabels[importDraft.sourceType]} · ${importDraft.fileName || '粘贴内容'}`, entryIds: [entry.id], importedAt: new Date().toISOString() }; setLibrary((current) => ({ ...current, entries: [...current.entries, entry], sources: [...current.sources, source] })); setSelectedSourceId(sourceId); setSelectedEntryId(''); setImportOpen(false); announce('资料已导入。现在可以选择已连接模型进行 AI 归纳。'); }
  async function synthesize() { const model = connectedModels.find((item) => item.id === synthesisModelId); if (!model) { setError(connectedModels.length ? '请选择一个已连接模型后再归纳。' : '当前没有可用模型，请先到模型配置测试连接。'); return; } if (!importDraft.text.trim()) { setError('请先导入或粘贴需要归纳的案例内容。'); return; } setSynthesisBusy(true); setSynthesisResult(undefined); setError(''); try { const result = await runKnowledgeSynthesis({ title: importDraft.title || '运营案例', sourceType: importDraft.sourceType, sourceText: importDraft.text }, library.entries.filter((entry) => entry.enabled).map(({ id, title, category, principle }) => ({ id, title, category, principle })), model); if (result.status !== 'success' || !result.output) throw new Error(formatProviderError(result.error, '模型未返回方法论。')); setSynthesisResult(result); announce(`已完成 ${model.name} 的方法论归纳，请检查后确认入库。`); } catch (reason) { setError(formatProviderError(reason, 'AI 归纳失败。')); } finally { setSynthesisBusy(false); } }
  function confirmSynthesis() { if (!synthesisResult?.output?.principles?.length) { setError('没有可导入的归纳结果。'); return; } const entries = synthesisResult.output.principles.map((item) => createKnowledgeEntry({ ...item, title: item.title, source: importDraft.title || 'AI 归纳案例', enabled: true, tags: item.tags || [] })); const sourceId = `synthesis-${Date.now()}`; const source = { id: sourceId, title: `${importDraft.title || '运营案例'} · AI 归纳`, type: 'analysis_case' as const, summary: `${synthesisResult.modelName} 归纳 · ${synthesisResult.output.summary}`, entryIds: entries.map((entry) => entry.id), importedAt: new Date().toISOString() }; setLibrary((current) => ({ ...current, entries: [...current.entries, ...entries], sources: [...current.sources, source] })); setSelectedSourceId(sourceId); setSelectedEntryId(''); setSynthesisResult(undefined); setImportOpen(false); announce(`已确认 ${entries.length} 条方法论，后续诊断会读取启用条目。`); }

  const deleteTitle = deleteTarget?.kind === 'all' ? '清空全部具体规则？' : deleteTarget?.kind === 'source' ? '删除这个规则库？' : '删除这条规则？';
  const deleteDescription = deleteTarget?.kind === 'all'
    ? `将永久删除当前 ${library.entries.length} 条具体规则，规则库名称和说明会保留。`
    : deleteTarget?.kind === 'source'
      ? `“${deleteTarget.source.title}”及其下属 ${deleteTarget.source.entryIds.length} 条规则都会被永久删除。`
      : `“${deleteTarget?.entry.title || ''}”将从所属规则库中永久删除。`;
  const deleteLabel = deleteTarget?.kind === 'all' ? '确认清空' : deleteTarget?.kind === 'source' ? '删除规则库' : '删除规则';

  return <div className="console-page knowledge-page">
    <div className="console-page-head"><div><span>运营知识库</span><h1>把增长运营经验变成诊断约束</h1></div><div className="console-page-actions"><button type="button" className="console-button" onClick={() => { setImportDraft({ title: '', sourceType: 'operation_doc', text: '', fileName: '' }); setImportOpen(true); }}><FileSpreadsheet size={15} /> 导入资料</button><button type="button" className="console-button danger" disabled={!library.entries.length} onClick={() => setDeleteTarget({ kind: 'all' })}><TrashCan size={15} /> 清空全部</button><button type="button" className="console-button primary" onClick={() => setSourceEditor({ title: '', summary: '' })}><Plus size={15} /> 新建规则库</button></div></div>
    <div className="knowledge-toolbar"><label className="knowledge-search"><span>搜索规则</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); entryListRef.current?.scrollTo({ top: 0 }); }} placeholder="标题、分类或标签" /></label><div className="knowledge-stats"><span><b>{enabledCount}</b> 条启用</span><span><b>{library.sources.length}</b> 个规则库</span><span>最后更新 {formatDate(library.updatedAt)}</span></div></div>
    <div className="knowledge-layout knowledge-layout-live">
      <aside className="knowledge-sources" aria-label="规则库">
        <div className="knowledge-sources-head"><span>规则库</span><button type="button" className="knowledge-icon-button" aria-label="新建规则库" onClick={() => setSourceEditor({ title: '', summary: '' })}><Plus size={16} /></button></div>
        {library.sources.map((source) => <div className={`knowledge-source-item ${selectedSource?.id === source.id ? 'active' : ''}`} key={source.id}><button type="button" className="knowledge-source-select" onClick={() => chooseSource(source.id)}><b>{source.title}</b><small>{sourceLabels[source.type]} · {source.entryIds.length} 条</small></button><button type="button" className="knowledge-source-edit" aria-label={`编辑规则库 ${source.title}`} onClick={() => setSourceEditor({ id: source.id, title: source.title, summary: source.summary })}><Pencil size={14} /></button></div>)}
      </aside>
      <section className="knowledge-detail">
        <div className="knowledge-detail-head"><div><span className="knowledge-kicker">{selectedSource ? sourceLabels[selectedSource.type] : '规则库'}</span><h2>{selectedSource?.title || '尚未选择规则库'}</h2>{selectedSource?.summary && <p className="knowledge-source-summary">{selectedSource.summary}</p>}</div>{selectedSource && <div className="knowledge-detail-actions"><span className="knowledge-status">{sourceEntries.filter((entry) => entry.enabled).length} 条启用</span><button type="button" className="console-button primary" onClick={() => openNewEntry()}><Plus size={14} /> 新增规则</button></div>}</div>
        <div className="knowledge-entry-list" ref={entryListRef}>{pageEntries.map((entry) => <article key={entry.id} className={`knowledge-rule knowledge-rule-live ${entry.id === selectedEntry?.id ? 'selected' : ''}`} onClick={() => setSelectedEntryId(entry.id)}><div className="knowledge-rule-copy"><div className="knowledge-rule-meta"><span className={`knowledge-severity ${entry.severity.toLowerCase()}`}>{entry.severity}</span><span>{entry.category}</span>{!entry.enabled && <em>已停用</em>}</div><b>{entry.title}</b><p>{entry.principle}</p><small>{entry.tags.map((tag) => `#${tag}`).join('  ') || '未添加标签'}</small></div><button type="button" className="knowledge-icon-button" aria-label={`编辑 ${entry.title}`} onClick={(event) => { event.stopPropagation(); openEntryEditor(entry); }}><Pencil size={15} /></button></article>)}{!visibleEntries.length && <div className="knowledge-empty">{query ? '没有匹配的具体规则。' : '当前规则库还没有具体规则。'}{selectedSource && <button type="button" className="console-button" onClick={() => openNewEntry()}><Plus size={14} /> 新增规则</button>}</div>}</div>
        <nav className="knowledge-pagination" aria-label="具体规则分页"><span>第 <b>{currentPage}</b> / {pageCount} 页 · 共 {visibleEntries.length} 条</span><div><button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}><ArrowLeft size={15} /></button><button type="button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => changePage(currentPage + 1)}><ArrowRight size={15} /></button></div></nav>
      </section>
      <aside className="knowledge-inspector">
        {selectedEntry ? <><div className="knowledge-inspector-head"><div><span>当前条目</span><h3>{selectedEntry.title}</h3></div><button type="button" className="console-button" onClick={() => openEntryEditor(selectedEntry)}><Pencil size={14} /> 编辑</button></div><dl><div><dt>原则</dt><dd>{selectedEntry.principle || '待补充'}</dd></div><div><dt>案例依据</dt><dd>{selectedEntry.evidence || '待补充'}</dd></div><div><dt>执行动作</dt><dd>{selectedEntry.action || '待补充'}</dd></div><div><dt>验证</dt><dd>{selectedEntry.validation || '待补充'}</dd></div><div><dt>护栏</dt><dd>{selectedEntry.guardrail || '待补充'}</dd></div></dl><div className="knowledge-inspector-actions"><button type="button" className="console-button" onClick={() => updateEntry(selectedEntry.id, { enabled: !selectedEntry.enabled })}>{selectedEntry.enabled ? '停用条目' : '启用条目'}</button><button type="button" className="console-button danger" onClick={() => setDeleteTarget({ kind: 'entry', entry: selectedEntry })}><TrashCan size={14} /> 删除规则</button></div></> : <div className="knowledge-inspector-empty"><Database size={28} /><span>当前条目</span><h3>待选择具体条目</h3></div>}
      </aside>
    </div>
    <div className="knowledge-import-hint"><Sparkles size={16} /><div><b>AI 归纳入口</b><InfoHint label="AI 归纳说明">导入运营文档或分析案例后，选择已配置并连接成功的模型，先预览归纳结果，再确认写入知识库。</InfoHint></div><button type="button" className="console-button" onClick={() => { setImportDraft({ title: '', sourceType: 'analysis_case', text: '', fileName: '' }); setImportOpen(true); }}>导入案例并归纳</button></div>
    {notice && <div className="knowledge-toast" role="status"><CheckmarkFilled size={15} /> {notice}</div>}{error && <div className="knowledge-toast error" role="alert">{error}</div>}

    {sourceEditor && <div className="knowledge-modal-backdrop" role="presentation"><form className="knowledge-modal knowledge-source-modal" onSubmit={saveSource}><header><div><span>{sourceEditor.id ? '编辑规则库' : '新建规则库'}</span><h2>{sourceEditor.id ? sourceEditor.title : '新建规则库'}</h2></div><button type="button" className="knowledge-close" aria-label="关闭规则库编辑" onClick={() => setSourceEditor(undefined)}><X size={18} /></button></header><div className="knowledge-form-grid"><label className="wide">规则库名称<input autoFocus value={sourceEditor.title} onChange={(event) => setSourceEditor({ ...sourceEditor, title: event.target.value })} placeholder="例如：企业 SaaS 转化原则" /></label><label className="wide">规则库说明<textarea value={sourceEditor.summary} onChange={(event) => setSourceEditor({ ...sourceEditor, summary: event.target.value })} placeholder="说明这个规则库适用的页面、目标或业务范围。" /></label></div><footer><div>{sourceBeingEdited && <button type="button" className="console-button danger" onClick={() => setDeleteTarget({ kind: 'source', source: sourceBeingEdited })}><TrashCan size={14} /> 删除规则库</button>}<button type="button" className="console-button" onClick={() => setSourceEditor(undefined)}>取消</button><button type="submit" className="console-button primary"><Save size={14} /> 保存规则库</button></div></footer></form></div>}

    {editor && <div className="knowledge-modal-backdrop" role="presentation"><form className="knowledge-modal" onSubmit={saveEntry}><header><div><span>{editor.id ? '编辑具体规则' : '新增具体规则'}</span><h2>{editor.id ? editor.title : '创建一条可复用原则'}</h2></div><button type="button" className="knowledge-close" aria-label="关闭编辑" onClick={() => { setEditor(undefined); setEditorSourceId(''); }}><X size={18} /></button></header><div className="knowledge-form-grid"><label className="wide">所属规则库<select value={editorSourceId} onChange={(event) => setEditorSourceId(event.target.value)}>{library.sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label>标题<input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><label>分类<input value={editor.category || ''} onChange={(event) => setEditor({ ...editor, category: event.target.value })} /></label><label>严重度<select value={editor.severity} onChange={(event) => setEditor({ ...editor, severity: event.target.value as KnowledgeSeverity })}>{severityOptions.map((severity) => <option key={severity}>{severity}</option>)}</select></label><label>标签<input value={(editor.tags || []).join(', ')} onChange={(event) => setEditor({ ...editor, tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="CTA, 首屏, 漏斗" /></label><label className="wide">原则<textarea value={editor.principle || ''} onChange={(event) => setEditor({ ...editor, principle: event.target.value })} /></label><label className="wide">案例依据<textarea value={editor.evidence || ''} onChange={(event) => setEditor({ ...editor, evidence: event.target.value })} /></label><label>执行动作<textarea value={editor.action || ''} onChange={(event) => setEditor({ ...editor, action: event.target.value })} /></label><label>验证方式<textarea value={editor.validation || ''} onChange={(event) => setEditor({ ...editor, validation: event.target.value })} /></label><label className="wide">护栏<textarea value={editor.guardrail || ''} onChange={(event) => setEditor({ ...editor, guardrail: event.target.value })} /></label></div><footer><label className="knowledge-check"><input type="checkbox" checked={editor.enabled !== false} onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })} /> 立即启用</label><div><button type="button" className="console-button" onClick={() => { setEditor(undefined); setEditorSourceId(''); }}>取消</button><button type="submit" className="console-button primary"><Save size={14} /> 保存规则</button></div></footer></form></div>}

    {importOpen && <div className="knowledge-modal-backdrop" role="presentation"><div className="knowledge-modal knowledge-import-modal"><header><div><span>{sourceTitle(importDraft.sourceType)}</span><h2>导入资料并生成运营方法论</h2></div><button type="button" className="knowledge-close" aria-label="关闭导入" onClick={() => setImportOpen(false)}><X size={18} /></button></header><form onSubmit={importSource}><div className="knowledge-import-controls"><label>来源标题<input value={importDraft.title} onChange={(event) => setImportDraft({ ...importDraft, title: event.target.value })} placeholder="例如：站内 MaaS 投放页面优化" /></label><label>资料类型<select value={importDraft.sourceType} onChange={(event) => setImportDraft({ ...importDraft, sourceType: event.target.value as ImportDraft['sourceType'] })}><option value="operation_doc">运营文档</option><option value="analysis_case">分析案例</option></select></label><label className="knowledge-file-picker"><input ref={importInputRef} type="file" accept=".docx,.md,.txt,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); }} /><FileSpreadsheet size={16} /> {importBusy ? '正在读取…' : importDraft.fileName || '选择 .docx / .md / .txt / .csv'}</label></div><label className="knowledge-source-text">资料正文<textarea value={importDraft.text} onChange={(event) => setImportDraft({ ...importDraft, text: event.target.value })} placeholder="可以直接粘贴运营总结、漏斗数据或页面分析。" /></label><div className="knowledge-ai-panel"><div><Sparkles size={16} /><div><b>用模型归纳为可复用原则</b><InfoHint label="AI 归纳配置说明">必须选择已启用且连接成功的模型；API Key 只随请求发送，不会显示在知识库或导出内容中。</InfoHint></div></div>{connectedModels.length ? <select value={synthesisModelId} onChange={(event) => setSynthesisModelId(event.target.value)}><option value="">选择归纳模型</option>{connectedModels.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}</select> : <button type="button" className="console-button" onClick={onOpenModels}>去配置并测试模型</button>}<button type="button" className="console-button primary" onClick={() => void synthesize()} disabled={synthesisBusy || !connectedModels.length}>{synthesisBusy ? '归纳中…' : '开始 AI 归纳'}</button></div>{synthesisResult?.output && <div className="knowledge-synthesis-preview"><header><div><span>模型归纳预览 · {synthesisResult.modelName}</span><h3>{synthesisResult.output.summary}</h3></div><b>{synthesisResult.output.principles.length} 条候选原则</b></header>{synthesisResult.output.principles.map((item, index) => <article key={`${item.id || 'principle'}-${index}`}><span className={`knowledge-severity ${(item.severity || 'P1').toLowerCase()}`}>{item.severity || 'P1'}</span><div><b>{item.title}</b><p>{item.principle}</p><small>{item.action}</small></div></article>)}<button type="button" className="console-button primary" onClick={confirmSynthesis}>确认写入知识库</button></div>}<footer><button type="button" className="console-button" onClick={() => setImportOpen(false)}>取消</button><button type="submit" className="console-button primary">保存来源</button></footer></form></div></div>}
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} title={deleteTitle} description={deleteDescription} confirmLabel={deleteLabel} onConfirm={confirmDelete} />
  </div>;
}
