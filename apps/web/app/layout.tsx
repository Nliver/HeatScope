import type { Metadata } from 'next';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';
import './workbench.css';

export const metadata: Metadata = {
  title: 'HeatScope | 页面增长诊断与改版闭环',
  description: '导入热力行为证据，比较模型分析，输出页面改版蓝图与上线复盘。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions may add attributes to <html> before React hydrates.
  // This boundary prevents an extension-only mutation from surfacing as an app error.
  return <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning><body>{children}</body></html>;
}
