/**
 * AEGIS ML Core — Feature engineering.
 *
 * Maps a raw Transaction into the dense numeric feature vector consumed by
 * the gradient-boosted model. Every feature here is:
 *  - computable at inference time from a single transaction + lightweight
 *    aggregated customer/device history (no future leakage),
 *  - meaningful to a risk analyst (we keep human-readable names so
 *    per-prediction contributions are interpretable),
 *  - scale-stable enough that a single tree ensemble trains robustly.
 *
 * Feature definitions are centralised here so training and inference share
 * exactly the same transformation (a common source of training/serving skew).
 */

import type { Transaction } from './data';

export interface FeatureSpec {
  name: string;
  /** Short human-readable description for the UI. */
  description: string;
  /** Coarse group used to organise explanations in the investigation view. */
  group: 'customer' | 'order' | 'payment' | 'behavior' | 'geography' | 'temporal';
}

/**
 * The canonical ordered feature list. The model is trained on exactly this
 * ordering; do not reorder without retraining.
 */
export const FEATURES: FeatureSpec[] = [
  // ---- customer ----
  { name: 'is_guest', description: 'Guest checkout (no account)', group: 'customer' },
  { name: 'customer_account_age_days', description: 'Customer account age in days', group: 'customer' },
  { name: 'customer_prior_orders', description: "Customer's prior order count", group: 'customer' },
  { name: 'customer_return_rate', description: "Customer's historical return rate", group: 'customer' },
  { name: 'customer_chargeback_rate', description: "Customer's historical chargeback rate", group: 'customer' },
  { name: 'customer_prior_chargebacks', description: "Customer's prior chargebacks", group: 'customer' },
  { name: 'customer_ltv', description: "Customer lifetime value (INR)", group: 'customer' },
  { name: 'account_age_lt_7d', description: 'Account < 7 days old', group: 'customer' },
  { name: 'account_age_lt_30d', description: 'Account < 30 days old', group: 'customer' },

  // ---- order ----
  { name: 'amount', description: 'Order amount (INR)', group: 'order' },
  { name: 'log_amount', description: 'Log of order amount', group: 'order' },
  { name: 'quantity', description: 'Items in order', group: 'order' },
  { name: 'category_base_risk', description: 'Category historical base risk', group: 'order' },
  { name: 'is_high_value_category', description: 'High-ticket category', group: 'order' },
  { name: 'amount_over_15k', description: 'Order > ₹15,000', group: 'order' },
  { name: 'amount_over_25k', description: 'Order > ₹25,000', group: 'order' },
  { name: 'is_gift_card', description: 'Gift card product', group: 'order' },

  // ---- payment ----
  { name: 'is_cod', description: 'Cash on Delivery', group: 'payment' },
  { name: 'is_upi', description: 'Paid via UPI', group: 'payment' },
  { name: 'is_emi', description: 'EMI payment', group: 'payment' },
  { name: 'is_credit_card', description: 'Paid via Credit Card', group: 'payment' },
  { name: 'cod_high_value', description: 'COD on high-value order', group: 'payment' },
  { name: 'emi_high_value', description: 'EMI on high-value order', group: 'payment' },

  // ---- behavior ----
  { name: 'device_seen_24h', description: 'Distinct customers on device (24h)', group: 'behavior' },
  { name: 'ip_seen_24h', description: 'Distinct customers on IP (24h)', group: 'behavior' },
  { name: 'customer_orders_1h', description: 'Customer orders in last 1h', group: 'behavior' },
  { name: 'customer_orders_24h', description: 'Customer orders in last 24h', group: 'behavior' },
  { name: 'customer_velocity_7d', description: 'Customer orders/day (7d)', group: 'behavior' },
  { name: 'time_since_last_order_h', description: 'Hours since last order', group: 'behavior' },
  { name: 'is_new_device_for_customer', description: 'First order on this device', group: 'behavior' },
  { name: 'device_ring_flag', description: 'Device flagged as multi-customer (>=3)', group: 'behavior' },
  { name: 'ip_ring_flag', description: 'IP flagged as multi-customer (>=3)', group: 'behavior' },
  { name: 'burst_purchase', description: '>=2 orders in last hour', group: 'behavior' },
  { name: 'new_device_guest_high_value', description: 'New device + guest + high value', group: 'behavior' },

  // ---- geography ----
  { name: 'shipping_tier_3', description: 'Tier-3 shipping city', group: 'geography' },
  { name: 'shipping_tier_1', description: 'Tier-1 shipping city', group: 'geography' },
  { name: 'address_mismatch', description: 'Billing != shipping city', group: 'geography' },
  { name: 'mismatch_cod', description: 'Address mismatch + COD', group: 'geography' },

  // ---- temporal ----
  { name: 'is_night_time', description: 'Order placed 22:00-05:00', group: 'temporal' },
  { name: 'is_weekend', description: 'Weekend order', group: 'temporal' },
  { name: 'is_festival_period', description: 'During festival/sale window', group: 'temporal' },
];

export const FEATURE_NAMES: string[] = FEATURES.map((f) => f.name);
export const FEATURE_COUNT = FEATURES.length;

export function featureValue(t: Transaction, name: string): number {
  switch (name) {
    case 'is_guest':
      return t.isGuest ? 1 : 0;
    case 'customer_account_age_days':
      return t.customerAccountAgeDays;
    case 'customer_prior_orders':
      return t.customerPriorOrders;
    case 'customer_return_rate':
      return t.customerReturnRate;
    case 'customer_chargeback_rate':
      return t.customerChargebackRate;
    case 'customer_prior_chargebacks':
      return t.customerPriorChargebacks;
    case 'customer_ltv':
      return Math.min(t.customerLtv, 500000);
    case 'account_age_lt_7d':
      return t.customerAccountAgeDays < 7 ? 1 : 0;
    case 'account_age_lt_30d':
      return t.customerAccountAgeDays < 30 ? 1 : 0;

    case 'amount':
      return Math.min(t.amount, 200000);
    case 'log_amount':
      return Math.log1p(Math.min(t.amount, 200000));
    case 'quantity':
      return t.quantity;
    case 'category_base_risk':
      return t.categoryBaseRisk;
    case 'is_high_value_category':
      return t.isHighValueCategory ? 1 : 0;
    case 'amount_over_15k':
      return t.amount > 15000 ? 1 : 0;
    case 'amount_over_25k':
      return t.amount > 25000 ? 1 : 0;
    case 'is_gift_card':
      return t.isGiftCard ? 1 : 0;

    case 'is_cod':
      return t.isCod ? 1 : 0;
    case 'is_upi':
      return t.isUpi ? 1 : 0;
    case 'is_emi':
      return t.isEmi ? 1 : 0;
    case 'is_credit_card':
      return t.paymentMethod === 'Credit Card' ? 1 : 0;
    case 'cod_high_value':
      return t.isCod && t.amount > 8000 ? 1 : 0;
    case 'emi_high_value':
      return t.isEmi && t.amount > 20000 ? 1 : 0;

    case 'device_seen_24h':
      return Math.min(t.deviceSeenCount24h, 20);
    case 'ip_seen_24h':
      return Math.min(t.ipSeenCount24h, 20);
    case 'customer_orders_1h':
      return Math.min(t.customerOrdersLast1h, 10);
    case 'customer_orders_24h':
      return Math.min(t.customerOrdersLast24h, 20);
    case 'customer_velocity_7d':
      return Math.min(t.customerVelocity7d, 10);
    case 'time_since_last_order_h':
      // null -> sentinel (large) meaning "no prior order"
      return t.timeSinceLastOrderHours === null ? 999 : Math.min(t.timeSinceLastOrderHours, 720);
    case 'is_new_device_for_customer':
      return t.isNewDeviceForCustomer ? 1 : 0;
    case 'device_ring_flag':
      return t.deviceSeenCount24h >= 3 ? 1 : 0;
    case 'ip_ring_flag':
      return t.ipSeenCount24h >= 3 ? 1 : 0;
    case 'burst_purchase':
      return t.customerOrdersLast1h >= 2 ? 1 : 0;
    case 'new_device_guest_high_value':
      return t.isNewDeviceForCustomer && t.isGuest && t.amount > 8000 ? 1 : 0;

    case 'shipping_tier_3':
      return t.shippingTier === 3 ? 1 : 0;
    case 'shipping_tier_1':
      return t.shippingTier === 1 ? 1 : 0;
    case 'address_mismatch':
      return t.addressMismatch ? 1 : 0;
    case 'mismatch_cod':
      return t.addressMismatch && t.isCod ? 1 : 0;

    case 'is_night_time':
      return t.isNightTime ? 1 : 0;
    case 'is_weekend':
      return t.isWeekend ? 1 : 0;
    case 'is_festival_period':
      return t.isFestivalPeriod ? 1 : 0;

    default: {
      // exhaustive check at compile time
      const _: never = name;
      void _;
      return 0;
    }
  }
}

/** Build a feature vector in canonical order. */
export function featurize(t: Transaction): number[] {
  return FEATURE_NAMES.map((n) => featureValue(t, n));
}

/** Batch-featurize an array of transactions. */
export function featurizeAll(rows: Transaction[]): number[][] {
  return rows.map(featurize);
}
