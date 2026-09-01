import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toDetail } from '@/lib/api-dto';
import { getModel } from '@/lib/ml/inference';

/**
 * POST /api/brief
 *
 * Generates an analyst-facing natural-language brief for a transaction,
 * GROUNDED in the actual transaction data and model explanation.
 *
 * This is an *optional* LLM enhancement. The core product (risk score,
 * factors, financial impact, decisions) works entirely without this
 * endpoint. If the SDK is unavailable, we return a deterministic
 * rule-based brief synthesized from the same data.
 *
 * Body: { id: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const model = getModel();
  const detail = toDetail(tx);
  const operatingThreshold = model.metrics.atDefaultThreshold.threshold;

  // Always compute a deterministic rule-based brief as the grounded source.
  const topPositive = detail.topFactors.filter((f) => f.contribution > 0).slice(0, 4);
  const topNegative = detail.topFactors.filter((f) => f.contribution < 0).slice(0, 2);
  const ruleBrief = synthesizeRuleBrief(detail, topPositive, topNegative, operatingThreshold);

  // Try the LLM enhancement. If it fails for any reason (no key, network,
  // etc.), we fall back to the rule-based brief so the feature always works.
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const prompt = buildLLMPrompt(detail, topPositive, topNegative, operatingThreshold);
    const resp = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are VIGILIS, an expert AI risk intelligence analyst for enterprise fraud detection. You write concise, grounded, decision-focused briefs. You NEVER invent facts. You only use the data provided. Keep responses under 180 words, use short paragraphs, and end with a single recommended defensive action.' },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    });
    const brief = resp.choices?.[0]?.message?.content?.trim();
    if (brief && brief.length > 20) {
      return NextResponse.json({
        source: 'llm',
        brief,
        groundedIn: topPositive.map((f) => f.feature),
      });
    }
  } catch (e) {
    // fall through to rule-based
    console.warn('[brief] LLM unavailable, using rule-based brief:', (e as Error).message?.slice(0, 120));
  }

  return NextResponse.json({
    source: 'rules',
    brief: ruleBrief,
    groundedIn: topPositive.map((f) => f.feature),
  });
}

function buildLLMPrompt(
  detail: ReturnType<typeof toDetail>,
  topPositive: { feature: string; description: string; value: number; contribution: number }[],
  topNegative: { feature: string; description: string; value: number; contribution: number }[],
  threshold: number,
): string {
  const lines: string[] = [];
  lines.push(`Transaction ${detail.id}`);
  lines.push(`Merchant: ${detail.merchantId} (${detail.merchantCategory})`);
  lines.push(`Order: ₹${detail.amount.toLocaleString('en-IN')} — ${detail.quantity}× ${detail.category} — paid via ${detail.paymentMethod}`);
  lines.push(`Customer: ${detail.customerId} ${detail.isGuest ? '(guest)' : ''}, account age ${detail.customerAccountAgeDays}d, prior orders ${detail.customerPriorOrders}, prior chargebacks ${detail.customerPriorChargebacks}, return rate ${(detail.customerReturnRate * 100).toFixed(0)}%`);
  lines.push(`Shipping: ${detail.shippingCity} (tier ${detail.shippingTier})${detail.addressMismatch ? ' [mismatch with billing]' : ''}`);
  lines.push(`Behavioural: device ${detail.deviceId} (seen ${detail.deviceSeenCount24h}× in 24h), IP ${detail.ipHash} (${detail.ipSeenCount24h}×), customer orders last 1h=${detail.customerOrdersLast1h}, 7d=${detail.customerOrdersLast7d}, new device=${detail.isNewDeviceForCustomer}`);
  lines.push(`Context: ${detail.isFestivalPeriod ? `festival period (${detail.festivalName})` : 'non-festival'}, ${detail.isNightTime ? 'night-time' : 'daytime'}, ${detail.isWeekend ? 'weekend' : 'weekday'}`);
  lines.push(``);
  lines.push(`Model risk score: ${(detail.riskScore * 100).toFixed(1)}% (operating threshold ${(threshold * 100).toFixed(1)}%)`);
  lines.push(`Top risk-increasing factors:`);
  topPositive.forEach((f) => lines.push(`  • ${f.description} (value=${f.value}, contribution=+${(f.contribution * 100).toFixed(1)}%)`));
  if (topNegative.length) {
    lines.push(`Risk-reducing factors:`);
    topNegative.forEach((f) => lines.push(`  • ${f.description} (value=${f.value}, contribution=${(f.contribution * 100).toFixed(1)}%)`));
  }
  if (detail.outcomeRealized) {
    lines.push(`Realized outcome: ${detail.outcomeKind}${detail.hadChargebackOrRto ? ` (loss ₹${detail.lossAmount.toLocaleString('en-IN')})` : ' (clean)'}`);
  } else {
    lines.push(`Outcome: pending (outcome window not elapsed)`);
  }
  lines.push(``);
  lines.push(`Write a concise analyst brief explaining (a) why this order is risky, (b) the financial exposure, and (c) the single recommended defensive action (approve / hold / escalate / dismiss). Be specific and use only the data above.`);
  return lines.join('\n');
}

function synthesizeRuleBrief(
  detail: ReturnType<typeof toDetail>,
  topPositive: { feature: string; description: string; value: number; contribution: number }[],
  topNegative: { feature: string; description: string; value: number; contribution: number }[],
  threshold: number,
): string {
  const riskPct = (detail.riskScore * 100).toFixed(1);
  const thrPct = (threshold * 100).toFixed(1);
  const band = detail.riskBand.toUpperCase();

  const reasons = topPositive.map((f) => f.description.toLowerCase()).slice(0, 3);
  const reasonsStr = reasons.length ? reasons.join('; ') : 'no single dominant signal';

  const exposure = detail.isCod
    ? `RTO exposure ~₹${Math.round(detail.amount * 0.18 + 180).toLocaleString('en-IN')}`
    : detail.isGiftCard
      ? `chargeback exposure ~₹${Math.round(detail.amount + 150 + detail.amount * 0.02).toLocaleString('en-IN')}`
      : `mixed exposure ~₹${Math.round(detail.amount * 0.55 + 120).toLocaleString('en-IN')}`;

  let recommendation: string;
  if (detail.riskScore >= threshold + 0.25) {
    recommendation = 'Recommendation: ESCALATE to senior review and hold fulfillment pending verification of customer identity and shipping address.';
  } else if (detail.riskScore >= threshold + 0.05) {
    recommendation = 'Recommendation: HOLD the order and request customer verification (ID + address proof) before dispatch.';
  } else if (detail.riskScore >= threshold - 0.05) {
    recommendation = 'Recommendation: APPROVE with enhanced monitoring; flag for post-purchase review if the customer repeats risky behaviour within 7 days.';
  } else {
    recommendation = 'Recommendation: APPROVE — risk is below the operating threshold. No action required.';
  }

  return [
    `${band} risk detected on order ${detail.id} — model score ${riskPct}% vs operating threshold ${thrPct}%.`,
    ``,
    `Primary risk drivers: ${reasonsStr}. The customer ${detail.isGuest ? 'is a guest checkout' : `has account age ${detail.customerAccountAgeDays}d`} with ${detail.customerPriorOrders} prior orders and a ${(detail.customerReturnRate * 100).toFixed(0)}% historical return rate. The order is for ₹${detail.amount.toLocaleString('en-IN')} of ${detail.category.toLowerCase()} paid via ${detail.paymentMethod}${detail.isCod ? ' (cash on delivery)' : ''}.`,
    ``,
    `${exposure}.`,
    ``,
    recommendation,
  ].join('\n');
}

export const dynamic = 'force-dynamic';
