'use client';

import { BookOpen, ClipboardList, Clock3, Download, Menu, PanelLeftClose, PanelLeftOpen, Settings2, Target, X } from './icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HISTORY_UPDATED_EVENT, readHistoryRecords } from '../lib/history';
import { InfoHint } from './ui-text';

export type ConsoleView = 'task' | 'knowledge' | 'history' | 'models';

export const consoleRouteByView: Record<ConsoleView, string> = {
  task: '/diagnosis',
  knowledge: '/knowledge',
  history: '/history',
  models: '/models',
};

export function consoleViewFromPathname(pathname: string): ConsoleView | undefined {
  const entry = (Object.entries(consoleRouteByView) as Array<[ConsoleView, string]>).find(([, route]) => pathname === route || pathname.startsWith(`${route}/`));
  return entry?.[0];
}

export const consoleNavigation: Array<{ id: ConsoleView; label: string; description: string; icon: typeof ClipboardList }> = [
  { id: 'task', label: '诊断任务', description: '线性 Wizard', icon: ClipboardList },
  { id: 'knowledge', label: '运营知识库', description: '方法论与规则', icon: BookOpen },
  { id: 'history', label: '历史记录', description: '诊断与复盘', icon: Clock3 },
  { id: 'models', label: '模型配置', description: 'API 与连接', icon: Settings2 },
];

export function ConsoleSidebar({ active, onChange, historyCount, modelCount, mobileOpen, collapsed, onClose, onToggleCollapsed }: {
  active: ConsoleView;
  onChange(view: ConsoleView): void;
  historyCount: number;
  modelCount: number;
  mobileOpen: boolean;
  collapsed: boolean;
  onClose(): void;
  onToggleCollapsed(): void;
}) {
  return <>
    <button type="button" className={`mobile-nav-backdrop ${mobileOpen ? 'visible' : ''}`} aria-label="关闭全局导航" onClick={onClose} />
    <aside className={`console-sidebar ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label="HeatScope 控制台导航">
      <div className="console-sidebar-mobile-head"><b>工作台</b><button type="button" aria-label="关闭全局导航" onClick={onClose}><X size={18} /></button></div>
      <div className="console-sidebar-heading"><div><span>工作台</span><small>页面增长诊断</small></div><button type="button" className="sidebar-collapse-button" aria-label={collapsed ? '展开功能列' : '收起功能列'} title={collapsed ? '展开功能列' : '收起功能列'} aria-expanded={!collapsed} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
      <nav>
        {consoleNavigation.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" className={`console-nav-item ${active === id ? 'active' : ''}`} onClick={() => { onChange(id); onClose(); }} aria-current={active === id ? 'page' : undefined}>
          <Icon size={17} strokeWidth={1.8} /><span><b>{label}</b><small>{description}</small></span>{id === 'history' && <em>{historyCount}</em>}{id === 'models' && modelCount > 0 && <em>{modelCount}</em>}
        </button>)}
      </nav>
      <div className="console-sidebar-note"><span>当前工作区</span><b>本地保存</b><InfoHint label="工作区存储说明">模型密钥仅在分析请求中使用，不写入项目文件。</InfoHint></div>
    </aside>
  </>;
}

export function ConsoleTopbar({ onMenu, onExport, note = '浏览器工作区已启用' }: { onMenu(): void; onExport?: () => void; note?: string }) {
  return <header className="workbench-topbar">
    <button type="button" className="mobile-menu-button" aria-label="打开全局导航" onClick={onMenu}><Menu size={19} /></button>
    <div className="brand workbench-brand"><span>H</span><div><b>HeatScope</b><small>页面增长诊断控制台</small></div></div>
    <div className="topbar-utilities"><span className="header-note"><Target size={15} /> {note}</span>{onExport && <button type="button" className="export-button" onClick={onExport}><Download size={16} /> 导出实施包</button>}<div className="avatar-pill">L</div></div>
  </header>;
}

export function ConsoleFooter() {
  return <footer className="workbench-footer">HeatScope · 页面增长诊断、模型分析、UI 方案与上线复盘</footer>;
}

export function ConsoleShell({ active, children, historyCount = 0, modelCount = 0, note = '浏览器工作区已启用' }: { active: ConsoleView; children: React.ReactNode; historyCount?: number; modelCount?: number; note?: string }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [storedHistoryCount, setStoredHistoryCount] = useState(historyCount);
  useEffect(() => {
    if (historyCount) return;
    function updateStoredHistoryCount() { try { setStoredHistoryCount(readHistoryRecords().length); } catch { setStoredHistoryCount(0); } }
    updateStoredHistoryCount();
    window.addEventListener(HISTORY_UPDATED_EVENT, updateStoredHistoryCount);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, updateStoredHistoryCount);
  }, [historyCount]);
  function changeView(view: ConsoleView) {
    router.push(consoleRouteByView[view]);
  }
  return <main className={`tool-shell workbench-shell console-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <ConsoleTopbar onMenu={() => setMobileOpen(true)} note={note} />
    <ConsoleSidebar active={active} onChange={changeView} historyCount={historyCount || storedHistoryCount} modelCount={modelCount} mobileOpen={mobileOpen} collapsed={collapsed} onClose={() => setMobileOpen(false)} onToggleCollapsed={() => setCollapsed((value) => !value)} />
    <section className="console-main"><div className="console-content">{children}</div></section>
    <ConsoleFooter />
  </main>;
}
