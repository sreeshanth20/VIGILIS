/**
 * AEGIS API — serialisation helpers + shared types.
 *
 * Converts Prisma rows into JSON-safe DTOs. BigInt (ts) must be converted to
 * a number for client consumption; we keep both `ts` (number) and `tsIso`
 * (string) for convenience.
 */

import type { Transaction } from '@prisma/client';

export interface TxSummary {
  id: string;
  ts: number;
  tsIso: string;
  merchantId: string;
  merchantCategory: string;
  customerId: string;
  isGuest: boolean;
  amount: number;
  category: string;
  paymentMethod: string;
  shippingCity: string;
  shippingTier: number;
  riskScore: number;
  riskBand: string;
  outcomeRealized: boolean;
  hadChargebackOrRto: boolean;
  outcomeKind: string;
  lossAmount: number;
  decision: string | null;
}

export interface TxDetail extends TxSummary {
  customerAccountAgeDays: number;
  customerPriorOrders: number;
  customerPriorReturns: number;
  customerPriorChargebacks: number;
  customerReturnRate: number;
  customerChargebackRate: number;
  customerLtv: number;
  quantity: number;
  categoryBaseRisk: number;
  isHighValueCategory: boolean;
  isCod: boolean;
  isPrepaid: boolean;
  isUpi: boolean;
  isEmi: boolean;
  isGiftCard: boolean;
  shippingState: string;
  billingCity: string;
  addressMismatch: boolean;
  deviceId: string;
  deviceSeenCount24h: number;
  ipHash: string;
  ipSeenCount24h: number;
  customerOrdersLast1h: number;
  customerOrdersLast24h: number;
  customerOrdersLast7d: number;
  customerVelocity7d: number;
  timeSinceLastOrderHours: number | null;
  isNewDeviceForCustomer: boolean;
  isFestivalPeriod: boolean;
  festivalName: string | null;
  isWeekend: boolean;
  isNightTime: boolean;
  dayOfYear: number;
  hour: number;
  topFactors: TopFactor[];
  decisionNote: string | null;
  decidedAt: string | null;
}

export interface TopFactor {
  feature: string;
  description: string;
  group: string;
  value: number;
  contribution: number;
}

export function toSummary(t: Transaction): TxSummary {
  return {
    id: t.id,
    ts: Number(t.ts),
    tsIso: new Date(Number(t.ts)).toISOString(),
    merchantId: t.merchantId,
    merchantCategory: t.merchantCategory,
    customerId: t.customerId,
    isGuest: t.isGuest,
    amount: t.amount,
    category: t.category,
    paymentMethod: t.paymentMethod,
    shippingCity: t.shippingCity,
    shippingTier: t.shippingTier,
    riskScore: t.riskScore,
    riskBand: t.riskBand,
    outcomeRealized: t.outcomeRealized,
    hadChargebackOrRto: t.hadChargebackOrRto,
    outcomeKind: t.outcomeKind,
    lossAmount: t.lossAmount,
    decision: t.decision,
  };
}

export function toDetail(t: Transaction): TxDetail {
  const factors: TopFactor[] = JSON.parse(t.topFactorsJson || '[]');
  return {
    ...toSummary(t),
    customerAccountAgeDays: t.customerAccountAgeDays,
    customerPriorOrders: t.customerPriorOrders,
    customerPriorReturns: t.customerPriorReturns,
    customerPriorChargebacks: t.customerPriorChargebacks,
    customerReturnRate: t.customerReturnRate,
    customerChargebackRate: t.customerChargebackRate,
    customerLtv: t.customerLtv,
    quantity: t.quantity,
    categoryBaseRisk: t.categoryBaseRisk,
    isHighValueCategory: t.isHighValueCategory,
    isCod: t.isCod,
    isPrepaid: t.isPrepaid,
    isUpi: t.isUpi,
    isEmi: t.isEmi,
    isGiftCard: t.isGiftCard,
    shippingState: t.shippingState,
    billingCity: t.billingCity,
    addressMismatch: t.addressMismatch,
    deviceId: t.deviceId,
    deviceSeenCount24h: t.deviceSeenCount24h,
    ipHash: t.ipHash,
    ipSeenCount24h: t.ipSeenCount24h,
    customerOrdersLast1h: t.customerOrdersLast1h,
    customerOrdersLast24h: t.customerOrdersLast24h,
    customerOrdersLast7d: t.customerOrdersLast7d,
    customerVelocity7d: t.customerVelocity7d,
    timeSinceLastOrderHours: t.timeSinceLastOrderHours,
    isNewDeviceForCustomer: t.isNewDeviceForCustomer,
    isFestivalPeriod: t.isFestivalPeriod,
    festivalName: t.festivalName,
    isWeekend: t.isWeekend,
    isNightTime: t.isNightTime,
    dayOfYear: t.dayOfYear,
    hour: t.hour,
    topFactors: factors,
    decisionNote: t.decisionNote,
    decidedAt: t.decidedAt ? t.decidedAt.toISOString() : null,
  };
}
