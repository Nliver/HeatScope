import * as XLSX from 'xlsx';

export type ElementKind = 'CTA' | '导航' | '内容' | '未知';
export type ElementRecord = {
  id: string;
  name: string;
  clicks: number;
  clickUv?: number;
  pagePv?: number;
  pageUv?: number;
  module?: string;
  selector?: string;
  link?: string;
  kind: ElementKind;
  share: number;
};

export type ImportedClicks = {
  elements: ElementRecord[];
  clicks: number;
  pagePv?: number;
  pageUv?: number;
  range: string;
  sourceName: string;
  sourceType: 'csv' | 'xlsx';
  columns: string[];
  excludedRows: number;
  warnings: string[];
};

const clean = (value: unknown = '') => String(value).replace(/^\uFEFF/, '').trim();
const normalize = (value: unknown = '') => clean(value).toLowerCase().replace(/[\s_\-()（）]/g, '');
const numberValue = (value: unknown = '') => {
  const result = Number(clean(value).replace(/[,%\s，]/g, ''));
  return Number.isFinite(result) ? result : 0;
};
const isTotal = (value: unknown) => /^(总和|合计|total|sum)$/i.test(clean(value));
const ctaPattern = /登录|注册|试用|体验|购买|咨询|获取|开始|提交|领取|开通|订阅|报价|apikey|api\s*key/i;
const navPattern = /首页|文档|控制台|导航|登录|帮助|社区|about|console|docs/i;

function readCsv(text: string) {
  const result: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && next === '"') { cell += char; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(clean(cell)); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(clean(cell)); if (row.some(Boolean)) result.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(clean(cell)); if (row.some(Boolean)) result.push(row);
  return result;
}

function findColumn(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalize(header))));
}

function kindFor(name: string): ElementKind {
  if (ctaPattern.test(name)) return 'CTA';
  if (navPattern.test(name)) return '导航';
  return name ? '内容' : '未知';
}

function parseRows(rows: unknown[][], sourceName: string, sourceType: 'csv' | 'xlsx'): ImportedClicks {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(clean);
    return findColumn(cells, [/区域|element|area|元素|按钮|event|名称|name/]) >= 0 && findColumn(cells, [/点击次数|clickcount|clicks|点击量|次数/]) >= 0;
  });
  if (headerIndex < 0) throw new Error('未识别到元素名称和点击次数字段。请上传含“区域/元素/名称”和“点击次数”的 CSV 或 XLSX。');

  const headers = rows[headerIndex].map(clean);
  const nameIndex = findColumn(headers, [/区域|element|area|元素|按钮|event|名称|name/]);
  const clickIndex = findColumn(headers, [/点击次数|clickcount|clicks|点击量|次数/]);
  const clickUvIndex = findColumn(headers, [/clickuv|点击uv|点击用户/]);
  const pagePvIndex = findColumn(headers, [/页面查看次数|pagepv|pageview|访问次数|pv/]);
  const pageUvIndex = findColumn(headers, [/页面uv|pageuv|访问用户|访问人数/]);
  const moduleIndex = findColumn(headers, [/module|模块|区域id/]);
  const selectorIndex = findColumn(headers, [/selector|选择器|elementid|元素id/]);
  const linkIndex = findColumn(headers, [/link|链接|url|target/]);
  const rangeIndex = findColumn(headers, [/日期范围|daterange|时间范围|date/]);

  let excludedRows = 0;
  let pagePv: number | undefined;
  let pageUv: number | undefined;
  let range = '';
  const records = rows.slice(headerIndex + 1).flatMap((row, index) => {
    const name = clean(row[nameIndex]);
    if (!name || isTotal(name)) { if (name) excludedRows += 1; return []; }
    const clicks = numberValue(row[clickIndex]);
    if (clicks < 0) { excludedRows += 1; return []; }
    const candidatePv = pagePvIndex >= 0 ? numberValue(row[pagePvIndex]) : 0;
    const candidateUv = pageUvIndex >= 0 ? numberValue(row[pageUvIndex]) : 0;
    if (candidatePv) pagePv = candidatePv;
    if (candidateUv) pageUv = candidateUv;
    if (!range && rangeIndex >= 0) range = clean(row[rangeIndex]);
    return [{
      id: `${index + 1}-${name}`, name, clicks,
      clickUv: clickUvIndex >= 0 ? numberValue(row[clickUvIndex]) || undefined : undefined,
      pagePv: candidatePv || undefined, pageUv: candidateUv || undefined,
      module: moduleIndex >= 0 ? clean(row[moduleIndex]) || undefined : undefined,
      selector: selectorIndex >= 0 ? clean(row[selectorIndex]) || undefined : undefined,
      link: linkIndex >= 0 ? clean(row[linkIndex]) || undefined : undefined,
      kind: kindFor(name), share: 0,
    }];
  });

  const pageMetrics = rows.slice(0, headerIndex).concat(rows.slice(headerIndex + 1)).map((row) => [clean(row[0]), row[1]] as const);
  if (!pagePv) pagePv = numberValue(pageMetrics.find(([label]) => /^(页面查看次数|page views|page pv)$/i.test(label))?.[1]) || undefined;
  if (!pageUv) pageUv = numberValue(pageMetrics.find(([label]) => /^(页面uv|page uv|访问用户)$/i.test(label))?.[1]) || undefined;
  if (!range) range = clean(pageMetrics.find(([label]) => /^(日期范围|date range)$/i.test(label))?.[1]) || '待确认';
  if (!records.length) throw new Error('文件中没有可导入的有效元素行。');

  const clicks = records.reduce((sum, item) => sum + item.clicks, 0);
  const elements = records.sort((a, b) => b.clicks - a.clicks).map((item) => ({ ...item, share: clicks ? Number((item.clicks / clicks * 100).toFixed(1)) : 0 }));
  const warnings: string[] = [];
  if (!pagePv && !pageUv) warnings.push('未提供页面 PV/UV：本次只能输出 L1 点击观察，不能计算 CTA 效率或转化。');
  if (elements.filter((item) => item.kind === 'CTA').length === 0) warnings.push('未自动识别主 CTA：请在分析前将主 CTA 标记为“核心动作”。');
  if (elements.some((item) => item.name && elements.filter((other) => other.name === item.name).length > 1 && !item.module && !item.selector)) warnings.push('存在同名元素且缺少模块/选择器，不能把它们归因为同一个页面位置。');
  return { elements, clicks, pagePv, pageUv, range, sourceName, sourceType, columns: headers, excludedRows, warnings };
}

export function parseClickCsv(text: string): ImportedClicks { return parseRows(readCsv(text), '导入 CSV', 'csv'); }

export async function parseBehaviorFile(file: File): Promise<ImportedClicks> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv' || file.type.includes('csv')) return parseRows(readCsv(await file.text()), file.name, 'csv');
  if (extension === 'xlsx' || extension === 'xls' || file.type.includes('spreadsheet')) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('工作簿中没有可读取的工作表。');
    return parseRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }), file.name, 'xlsx');
  }
  throw new Error('仅支持 CSV、XLSX 或 XLS 行为数据文件。');
}
