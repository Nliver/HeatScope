import csv, json, os, re
from collections import Counter, defaultdict

files = [
    '/Users/admin/Downloads/Clarity_注册_Area_电脑_07-24-2026 17 21.csv',
    '/Users/admin/Downloads/Clarity_注册_Area_电脑_07-24-2026 16 56.csv',
    '/Users/admin/Downloads/Clarity_注册_Area_电脑_07-24-2026 16 36.csv',
]

def load(path):
    with open(path, encoding='utf-8-sig', newline='') as fh:
        rows = list(csv.reader(fh))
    meta = {}
    for row in rows[:10]:
        if len(row) >= 2 and row[0].strip():
            meta[row[0].strip()] = row[1].strip()
    header = next((i for i, row in enumerate(rows) if len(row) >= 3 and row[0] == '区域'), None)
    data = []
    for row in rows[header + 1:]:
        if len(row) < 3:
            continue
        label, clicks, ctr = row[0], row[1], row[2]
        try:
            click_n = int(clicks)
        except ValueError:
            continue
        try:
            ctr_n = float(ctr.replace('%', ''))
        except ValueError:
            ctr_n = None
        data.append({'label': label, 'clicks': click_n, 'ctr': ctr_n})
    return meta, data

def clean_label(label):
    return re.sub(r'\s+', ' ', label).strip()

for path in files:
    meta, data = load(path)
    total = sum(x['clicks'] for x in data)
    positive = [x for x in data if x['clicks'] > 0]
    zeros = len(data) - len(positive)
    duplicates = Counter(clean_label(x['label']) for x in data)
    top = sorted(data, key=lambda x: x['clicks'], reverse=True)[:15]
    print('\n###', os.path.basename(path))
    print('URL:', meta.get('已访问 URL 包含'))
    print('PV:', meta.get('页面查看次数'), 'rows:', len(data), 'positive:', len(positive), 'zeros:', zeros, 'sum_clicks:', total)
    print('duplicate_labels:', [(k, v) for k,v in duplicates.most_common() if v > 1][:15])
    for x in top:
        print(json.dumps({'label': clean_label(x['label'])[:120], 'clicks': x['clicks'], 'ctr': x['ctr']}, ensure_ascii=False))
    groups = defaultdict(lambda: {'clicks': 0, 'ctr': 0.0, 'rows': 0})
    for x in data:
        key = clean_label(x['label'])
        groups[key]['clicks'] += x['clicks']
        groups[key]['ctr'] += x['ctr'] or 0
        groups[key]['rows'] += 1
    print('aggregates_exact:')
    for key, g in sorted(groups.items(), key=lambda kv: kv[1]['clicks'], reverse=True)[:20]:
        if g['rows'] > 1 or key in {'立即购买', '前往了解', 'AI 大模型', '控制台'}:
            print(json.dumps({'label': key[:100], **g}, ensure_ascii=False))
    top3 = sum(x['clicks'] for x in top[:3])
    top5 = sum(x['clicks'] for x in top[:5])
    print('top3_share:', round(top3/total*100, 2), 'top5_share:', round(top5/total*100, 2), 'events_per_pv:', round(total/float(meta.get('页面查看次数', 1))*100, 2))
