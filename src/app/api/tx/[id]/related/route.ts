import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toSummary } from '@/lib/api-dto';

/**
 * GET /api/tx/[id]/related
 *
 * Related transactions used to surface abuse-ring patterns in the
 * investigation view: same customer / device / IP, plus the device & IP
 * "ring" summary (how many distinct customers used them recently).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // Same customer (recent history)
  const sameCustomer = await db.transaction.findMany({
    where: { customerId: tx.customerId, id: { not: tx.id } },
    orderBy: { ts: 'desc' },
    take: 15,
  });

  // Same device (potential ring)
  const sameDevice = await db.transaction.findMany({
    where: { deviceId: tx.deviceId, id: { not: tx.id } },
    orderBy: { ts: 'desc' },
    take: 15,
    select: {
      id: true, ts: true, customerId: true, amount: true, riskScore: true,
      riskBand: true, category: true, paymentMethod: true, isGuest: true,
      outcomeRealized: true, hadChargebackOrRto: true, outcomeKind: true,
    },
  });

  // Same IP
  const sameIp = await db.transaction.findMany({
    where: { ipHash: tx.ipHash, id: { not: tx.id } },
    orderBy: { ts: 'desc' },
    take: 15,
    select: {
      id: true, ts: true, customerId: true, amount: true, riskScore: true,
      riskBand: true, category: true, paymentMethod: true, isGuest: true,
      outcomeRealized: true, hadChargebackOrRto: true, outcomeKind: true,
    },
  });

  // Distinct customers on this device + IP (ring strength)
  const deviceCustomerCount = await db.transaction.groupBy({
    by: ['customerId'],
    where: { deviceId: tx.deviceId },
    _count: { _all: true },
  });
  const ipCustomerCount = await db.transaction.groupBy({
    by: ['customerId'],
    where: { ipHash: tx.ipHash },
    _count: { _all: true },
  });

  return NextResponse.json({
    sameCustomer: sameCustomer.map(toSummary),
    sameDevice: sameDevice.map((t) => ({
      id: t.id,
      ts: Number(t.ts),
      tsIso: new Date(Number(t.ts)).toISOString(),
      customerId: t.customerId,
      amount: t.amount,
      riskScore: t.riskScore,
      riskBand: t.riskBand,
      category: t.category,
      paymentMethod: t.paymentMethod,
      isGuest: t.isGuest,
      outcomeRealized: t.outcomeRealized,
      hadChargebackOrRto: t.hadChargebackOrRto,
      outcomeKind: t.outcomeKind,
    })),
    sameIp: sameIp.map((t) => ({
      id: t.id,
      ts: Number(t.ts),
      tsIso: new Date(Number(t.ts)).toISOString(),
      customerId: t.customerId,
      amount: t.amount,
      riskScore: t.riskScore,
      riskBand: t.riskBand,
      category: t.category,
      paymentMethod: t.paymentMethod,
      isGuest: t.isGuest,
      outcomeRealized: t.outcomeRealized,
      hadChargebackOrRto: t.hadChargebackOrRto,
      outcomeKind: t.outcomeKind,
    })),
    ring: {
      deviceCustomers: deviceCustomerCount.length,
      deviceOrders: deviceCustomerCount.reduce((s, g) => s + g._count._all, 0),
      ipCustomers: ipCustomerCount.length,
      ipOrders: ipCustomerCount.reduce((s, g) => s + g._count._all, 0),
    },
  });
}

export const dynamic = 'force-dynamic';
