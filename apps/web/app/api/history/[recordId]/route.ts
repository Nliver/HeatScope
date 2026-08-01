import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side contract for a future persistent history adapter.
 * Diagnosis fields are deliberately rejected here; only a review conclusion
 * may be appended after a snapshot has been frozen.
 */
export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await context.params;
  const body = await request.json().catch(() => null) as { diagnosisChecksum?: unknown; reviewConclusion?: unknown; status?: unknown; [key: string]: unknown } | null;
  if (!body) return NextResponse.json({ error: '请求体不是有效 JSON。' }, { status: 400 });
  const immutableFields = Object.keys(body).filter((key) => !['diagnosisChecksum', 'reviewConclusion', 'status'].includes(key));
  if (immutableFields.length || body.status !== 'completed' || typeof body.diagnosisChecksum !== 'string' || !body.reviewConclusion) {
    return NextResponse.json({ error: '历史快照已冻结，只允许提交 reviewConclusion 和完成状态。', recordId }, { status: 409 });
  }
  return NextResponse.json({ ok: true, recordId, diagnosisChecksum: body.diagnosisChecksum, reviewConclusion: body.reviewConclusion }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT() {
  return NextResponse.json({ error: '历史快照禁止整体更新，请只提交复盘结论。' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: '历史快照禁止删除。' }, { status: 405 });
}
