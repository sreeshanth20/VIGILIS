import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

/**
 * POST /api/tx/[id]/decision
 *
 * Record an analyst decision on a transaction. Strictly defense-only: the
 * allowed decisions are all protective actions (hold/escalate) or releases
 * (approve/dismiss). No offensive capability is exposed.
 *
 * Body: { decision: 'approve'|'hold'|'escalate'|'dismiss', note?: string }
 */
const DecisionSchema = z.object({
  decision: z.enum(['approve', 'hold', 'escalate', 'dismiss']),
  note: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid decision payload', details: parsed.error.flatten() }, { status: 400 });
  }
  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  const now = new Date();
  const updated = await db.transaction.update({
    where: { id },
    data: {
      decision: parsed.data.decision,
      decisionNote: parsed.data.note ?? null,
      decidedAt: now,
      decidedBy: 'analyst',
    },
  });
  await db.auditLog.create({
    data: {
      action: 'decision',
      actor: 'analyst',
      targetTx: id,
      payloadJson: JSON.stringify({ decision: parsed.data.decision, note: parsed.data.note ?? null }),
    },
  });
  return NextResponse.json({
    ok: true,
    id: updated.id,
    decision: updated.decision,
    decisionNote: updated.decisionNote,
    decidedAt: updated.decidedAt?.toISOString() ?? null,
  });
}

export const dynamic = 'force-dynamic';
