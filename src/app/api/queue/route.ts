import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toSummary } from '@/lib/api-dto';

/**
 * GET /api/queue
 *
 * Paginated, filtered, sortable list of transactions for the risk queue.
 *
 * Query params:
 *   page (default 1), pageSize (default 50, max 200)
 *   sort: riskScore|ts|amount  (default riskScore)
 *   order: desc|asc            (default desc)
 *   band: critical|high|elevated|normal  (optional, comma-separated)
 *   status: pending|realized|flagged|decided  (optional)
 *   merchantId (optional)
 *   search (optional, matches id/customerId/deviceId/ipHash)
 *   minScore, maxScore (optional)
 *   minAmount (optional)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.get('pageSize') ?? '50', 10) || 50));
  const sortField = (sp.get('sort') ?? 'riskScore') as 'riskScore' | 'ts' | 'amount';
  const order = (sp.get('order') ?? 'desc') as 'asc' | 'desc';
  const bandsParam = sp.get('band');
  const bands = bandsParam ? bandsParam.split(',').filter(Boolean) : null;
  const status = sp.get('status');
  const merchantId = sp.get('merchantId') ?? undefined;
  const search = sp.get('search') ?? undefined;
  const minScore = sp.get('minScore') ? parseFloat(sp.get('minScore')!) : undefined;
  const maxScore = sp.get('maxScore') ? parseFloat(sp.get('maxScore')!) : undefined;
  const minAmount = sp.get('minAmount') ? parseInt(sp.get('minAmount')!, 10) : undefined;

  const where: Record<string, unknown> = {};
  if (bands && bands.length) where.riskBand = { in: bands };
  if (status === 'pending') where.outcomeRealized = false;
  else if (status === 'realized') where.outcomeRealized = true;
  else if (status === 'flagged') where.riskScore = { gte: 0.35 };
  else if (status === 'decided') where.decision = { not: null };
  if (merchantId) where.merchantId = merchantId;
  if (typeof minScore === 'number' || typeof maxScore === 'number') {
    where.riskScore = { ...(where.riskScore as object || {}), ...(minScore !== undefined ? { gte: minScore } : {}), ...(maxScore !== undefined ? { lte: maxScore } : {}) };
  }
  if (minAmount) where.amount = { gte: minAmount };
  if (search) {
    where.OR = [
      { id: { contains: search } },
      { customerId: { contains: search } },
      { deviceId: { contains: search } },
      { ipHash: { contains: search } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.transaction.count({ where }),
    db.transaction.findMany({
      where,
      orderBy: { [sortField]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items: rows.map(toSummary),
  });
}

export const dynamic = 'force-dynamic';
