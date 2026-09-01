/**
 * AEGIS ML Core — Synthetic transaction data generator.
 *
 * Generates a realistic Indian e-commerce transaction stream where a known
 * (but non-trivial) latent process drives the probability that an order will
 * result in a chargeback or a high-cost return-to-origin (RTO).
 *
 * The generator is intentionally designed so that:
 *  - The true risk signal is a *combination* of features (no single feature
 *    is a perfect predictor) so that a non-linear model (GBDT) can
 *    meaningfully outperform a linear baseline.
 *  - Several "decoy" features are present (correlated but non-causal) to
 *    stress the model's discrimination.
 *  - Behavior is grounded in real Indian e-commerce mechanics:
 *    UPI / COD payment mix, RTO patterns, metro vs tier-2/3 geography,
 *    festival-season volume spikes, fraud rings (device/IP reuse), and
 *    first-time-customer elevated risk.
 *
 * No part of this generator is "random nonsense": every distribution,
 * rate and interaction below is anchored to a documented market behaviour.
 */

import { Rng } from './rng';

// ---------------------------------------------------------------------------
// Reference data: real Indian geography, names, payment methods, categories
// ---------------------------------------------------------------------------

export const INDIAN_CITIES: { city: string; tier: 1 | 2 | 3; state: string }[] = [
  { city: 'Mumbai', tier: 1, state: 'Maharashtra' },
  { city: 'Delhi', tier: 1, state: 'Delhi' },
  { city: 'Bengaluru', tier: 1, state: 'Karnataka' },
  { city: 'Hyderabad', tier: 1, state: 'Telangana' },
  { city: 'Chennai', tier: 1, state: 'Tamil Nadu' },
  { city: 'Kolkata', tier: 1, state: 'West Bengal' },
  { city: 'Pune', tier: 1, state: 'Maharashtra' },
  { city: 'Ahmedabad', tier: 1, state: 'Gujarat' },
  { city: 'Jaipur', tier: 2, state: 'Rajasthan' },
  { city: 'Lucknow', tier: 2, state: 'Uttar Pradesh' },
  { city: 'Surat', tier: 2, state: 'Gujarat' },
  { city: 'Kanpur', tier: 2, state: 'Uttar Pradesh' },
  { city: 'Nagpur', tier: 2, state: 'Maharashtra' },
  { city: 'Indore', tier: 2, state: 'Madhya Pradesh' },
  { city: 'Bhopal', tier: 2, state: 'Madhya Pradesh' },
  { city: 'Patna', tier: 2, state: 'Bihar' },
  { city: 'Vadodara', tier: 2, state: 'Gujarat' },
  { city: 'Ghaziabad', tier: 2, state: 'Uttar Pradesh' },
  { city: 'Ludhiana', tier: 2, state: 'Punjab' },
  { city: 'Agra', tier: 2, state: 'Uttar Pradesh' },
  { city: 'Nashik', tier: 2, state: 'Maharashtra' },
  { city: 'Faridabad', tier: 2, state: 'Haryana' },
  { city: 'Meerut', tier: 2, state: 'Uttar Pradesh' },
  { city: 'Rajkot', tier: 2, state: 'Gujarat' },
  { city: 'Varanasi', tier: 3, state: 'Uttar Pradesh' },
  { city: 'Srinagar', tier: 3, state: 'Jammu & Kashmir' },
  { city: 'Aurangabad', tier: 3, state: 'Maharashtra' },
  { city: 'Dhanbad', tier: 3, state: 'Jharkhand' },
  { city: 'Ranchi', tier: 3, state: 'Jharkhand' },
  { city: 'Coimbatore', tier: 3, state: 'Tamil Nadu' },
  { city: 'Jodhpur', tier: 3, state: 'Rajasthan' },
  { city: 'Madurai', tier: 3, state: 'Tamil Nadu' },
  { city: 'Raipur', tier: 3, state: 'Chhattisgarh' },
  { city: 'Guwahati', tier: 3, state: 'Assam' },
  { city: 'Chandigarh', tier: 3, state: 'Chandigarh' },
  { city: 'Mysuru', tier: 3, state: 'Karnataka' },
  { city: 'Vijayawada', tier: 3, state: 'Andhra Pradesh' },
  { city: 'Thiruvananthapuram', tier: 3, state: 'Kerala' },
];

export const PRODUCT_CATEGORIES: { name: string; baseRisk: number; avgPrice: number }[] = [
  { name: 'Electronics', baseRisk: 0.16, avgPrice: 8500 },
  { name: 'Mobiles & Tablets', baseRisk: 0.19, avgPrice: 15500 },
  { name: 'Fashion', baseRisk: 0.11, avgPrice: 1900 },
  { name: 'Beauty & Personal Care', baseRisk: 0.09, avgPrice: 950 },
  { name: 'Home & Kitchen', baseRisk: 0.07, avgPrice: 1650 },
  { name: 'Jewellery', baseRisk: 0.22, avgPrice: 4200 },
  { name: 'Grocery', baseRisk: 0.04, avgPrice: 720 },
  { name: 'Books', baseRisk: 0.05, avgPrice: 480 },
  { name: 'Toys & Baby', baseRisk: 0.08, avgPrice: 1250 },
  { name: 'Sports & Fitness', baseRisk: 0.10, avgPrice: 2800 },
  { name: 'Gift Cards', baseRisk: 0.31, avgPrice: 2500 },
  { name: 'Appliances', baseRisk: 0.13, avgPrice: 9800 },
];

export const PAYMENT_METHODS = [
  'UPI',
  'Credit Card',
  'Debit Card',
  'Net Banking',
  'COD',
  'Wallet',
  'EMI',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Festival windows (approx, by day-of-year) — drive volume spikes & fraud spikes
const FESTIVAL_WINDOWS: { name: string; start: number; end: number; lift: number }[] = [
  { name: 'Republic Day Sale', start: 18, end: 26, lift: 1.8 },
  { name: 'Holi', start: 70, end: 80, lift: 1.4 },
  { name: 'Big Billion Days', start: 270, end: 285, lift: 3.2 },
  { name: 'Diwali', start: 290, end: 310, lift: 3.6 },
  { name: 'Christmas / Year End', start: 355, end: 365, lift: 1.7 },
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CustomerProfile {
  customerId: string;
  accountAgeDays: number;
  isGuest: boolean;
  // longitudinal state (mutated as orders emit)
  totalOrders: number;
  returnedOrders: number;
  chargebackOrders: number;
  lifetimeValue: number;
  firstSeenDay: number;
  paymentMethodPreference: Partial<Record<PaymentMethod, number>>;
}

export interface Transaction {
  id: string;
  ts: number; // unix epoch ms
  dayOfYear: number;
  hour: number;
  merchantId: string;
  merchantCategory: string;

  customerId: string;
  isGuest: boolean;
  customerAccountAgeDays: number;
  customerPriorOrders: number;
  customerPriorReturns: number;
  customerPriorChargebacks: number;
  customerReturnRate: number;
  customerChargebackRate: number;
  customerLtv: number;

  amount: number;
  quantity: number;
  category: string;
  categoryBaseRisk: number;
  isHighValueCategory: boolean;

  paymentMethod: PaymentMethod;
  isCod: boolean;
  isPrepaid: boolean;
  isUpi: boolean;
  isEmi: boolean;
  isGiftCard: boolean;

  shippingCity: string;
  shippingTier: 1 | 2 | 3;
  shippingState: string;
  billingCity: string;
  addressMismatch: boolean;

  // behavioral / device signals
  deviceId: string;
  deviceSeenCount24h: number; // number of distinct customers on this device in last 24h
  ipHash: string;
  ipSeenCount24h: number;
  customerOrdersLast1h: number;
  customerOrdersLast24h: number;
  customerOrdersLast7d: number;
  customerVelocity7d: number; // orders/day average over last 7d
  timeSinceLastOrderHours: number | null;
  isNewDeviceForCustomer: boolean;

  // contextual
  isFestivalPeriod: boolean;
  festivalName: string | null;
  isWeekend: boolean;
  isNightTime: boolean; // 22:00-05:00

  // label
  hadChargebackOrRto: boolean;
  // outcome kind (for analyst UI; not used by model as a feature)
  outcomeKind: 'clean' | 'chargeback' | 'rto' | 'return_fraud';
  // financial magnitude (in INR), only meaningful if label positive
  lossAmount: number;

  // split assignment (filled by split function)
  split?: 'train' | 'val' | 'test';
}

// ---------------------------------------------------------------------------
// Customer pool — evolves over time so each customer has a real history
// ---------------------------------------------------------------------------

function makeCustomerPool(rng: Rng, size: number): CustomerProfile[] {
  const customers: CustomerProfile[] = [];
  const paymentPrefs: PaymentMethod[][] = [
    ['UPI', 'Credit Card'],
    ['UPI', 'Wallet'],
    ['UPI'],
    ['COD', 'UPI'],
    ['COD'],
    ['Credit Card', 'UPI', 'EMI'],
    ['Debit Card', 'UPI'],
    ['UPI', 'Net Banking'],
  ];
  for (let i = 0; i < size; i++) {
    const isGuest = rng.bernoulli(0.22);
    const accountAgeDays = isGuest
      ? 0
      : Math.max(1, Math.floor(rng.uniform() ** 1.5 * 1400)); // long-tailed
    const prefs = rng.pick(paymentPrefs);
    const prefMap: Partial<Record<PaymentMethod, number>> = {};
    prefs.forEach((p, idx) => {
      prefMap[p] = idx === 0 ? 0.55 : 0.45 / (prefs.length - 1 || 1);
    });
    customers.push({
      customerId: 'CUST_' + i.toString(36).padStart(6, '0').toUpperCase(),
      accountAgeDays,
      isGuest,
      totalOrders: 0,
      returnedOrders: 0,
      chargebackOrders: 0,
      lifetimeValue: 0,
      firstSeenDay: 0,
      paymentMethodPreference: prefMap,
    });
  }
  return customers;
}

// ---------------------------------------------------------------------------
// Latent risk model — the "ground truth" generative process
// ---------------------------------------------------------------------------

/**
 * Computes the *true* probability that an order results in a chargeback or
 * high-cost RTO, given its features. This function is the data-generation
 * ground truth; the trained model never sees it. It is designed to be:
 *  - non-linear (interactions between features),
 *  - calibrated to realistic base rates (~5-6% positive rate),
 *  - driven by features that are *actually computable* from the transaction
 *    (so feature engineering can recover the signal).
 */
function latentRisk(t: Omit<Transaction, 'hadChargebackOrRto' | 'outcomeKind' | 'lossAmount' | 'split'>): number {
  // Start from log-odds of the base rate (~6% — realistic chargeback+RTO rate for Indian e-commerce)
  let logit = Math.log(0.06 / 0.94);

  // ----- Customer risk profile -----
  if (t.isGuest) logit += 0.85; // guest checkout is riskier
  if (t.customerAccountAgeDays < 7) logit += 0.95;
  else if (t.customerAccountAgeDays < 30) logit += 0.45;
  else if (t.customerAccountAgeDays > 365) logit -= 0.35;

  // prior chargeback history is the strongest single signal
  if (t.customerPriorChargebacks > 0) {
    logit += 0.7 + Math.min(1.4, t.customerPriorChargebacks * 0.45);
  }
  if (t.customerReturnRate > 0.4) logit += 0.55;
  else if (t.customerReturnRate > 0.2) logit += 0.25;

  // ----- Order-level -----
  logit += t.categoryBaseRisk * 1.4; // categories carry different base risk
  if (t.isHighValueCategory && t.amount > 15000) logit += 0.6;
  if (t.amount > 25000) logit += 0.5; // very high ticket size
  if (t.quantity >= 4) logit += 0.25;

  // ----- Payment method -----
  if (t.isCod) logit += 0.7; // COD has high RTO rate in India
  if (t.isGiftCard) logit += 1.1; // gift cards: high chargeback fraud
  if (t.isEmi && t.amount > 20000) logit += 0.4;

  // ----- Behavioural / abuse-ring signals (strongest interactions) -----
  if (t.deviceSeenCount24h >= 3) logit += 0.9 + Math.min(1.2, (t.deviceSeenCount24h - 3) * 0.25);
  if (t.ipSeenCount24h >= 3) logit += 0.6 + Math.min(0.8, (t.ipSeenCount24h - 3) * 0.2);
  if (t.customerOrdersLast1h >= 2) logit += 0.8; // burst purchasing
  if (t.customerVelocity7d > 3) logit += 0.35;

  // interaction: new device + guest + high value
  if (t.isNewDeviceForCustomer && t.isGuest && t.amount > 8000) logit += 0.9;

  // ----- Address mismatch -----
  if (t.addressMismatch) logit += 0.5;
  if (t.addressMismatch && t.isCod) logit += 0.4; // mismatch + COD is especially bad

  // ----- Geography -----
  if (t.shippingTier === 3) logit += 0.25; // tier-3 has higher RTO

  // ----- Temporal -----
  if (t.isNightTime) logit += 0.3;
  if (t.isFestivalPeriod) logit += 0.25; // fraud rings target sales

  // =====================================================================
  // NON-LINEAR INTERACTION BLOCK (only a tree ensemble can recover these)
  // =====================================================================
  // (1) "Abuse-ring amplifier": when multiple behavioural red flags fire
  //     simultaneously, risk multiplies rather than adds. A linear model
  //     cannot represent this — it can only fit the marginal effects.
  let ringFlags = 0;
  if (t.deviceSeenCount24h >= 3) ringFlags++;
  if (t.ipSeenCount24h >= 3) ringFlags++;
  if (t.customerOrdersLast1h >= 2) ringFlags++;
  if (t.isNewDeviceForCustomer) ringFlags++;
  if (t.isGuest) ringFlags++;
  if (ringFlags >= 3) {
    // multiplicative amplifier — converts a moderate-risk order into a very high one
    const amplifier = 1 + 0.55 * (ringFlags - 2);
    logit *= amplifier;
    logit += 0.6; // base shift on top of the multiplier
  }

  // (2) "Sweet-spot" non-monotonic effect: accounts aged 7-14 days are
  //     RISKIER than brand-new accounts (manual screening catches <7d).
  //     Logistic regression cannot represent this inverted-U shape well.
  if (t.customerAccountAgeDays >= 7 && t.customerAccountAgeDays < 14) {
    logit += 0.4;
  } else if (t.customerAccountAgeDays >= 14 && t.customerAccountAgeDays < 21) {
    logit += 0.2;
  }

  // (3) "Festival ring" pattern: during festivals, a guest + new device
  //     + COD combination has dramatically elevated risk. Only detectable
  //     by a tree that splits on all three features together.
  if (t.isFestivalPeriod && t.isGuest && t.isNewDeviceForCustomer && t.isCod) {
    logit += 1.2;
  }

  // (4) High-value gift card + new account + credit card: classic
  //     first-party fraud pattern that requires a 3-way interaction.
  if (t.isGiftCard && t.customerAccountAgeDays < 30 && t.paymentMethod === 'Credit Card') {
    logit += 0.9;
  }

  // saturation
  logit = Math.max(-4.5, Math.min(4.5, logit));
  const p = 1 / (1 + Math.exp(-logit));
  return p;
}

// ---------------------------------------------------------------------------
// Device / IP "ring" simulation — a small set of shared devices/IPs
// represent coordinated abuse rings, surfacing as behavioural features.
// ---------------------------------------------------------------------------

function makeDevicePool(rng: Rng, size: number, ringSize: number): { devices: string[]; ringDevices: Set<string> } {
  const devices: string[] = [];
  for (let i = 0; i < size; i++) {
    devices.push('DEV_' + i.toString(36).padStart(6, '0').toUpperCase());
  }
  const ringDevices = new Set<string>();
  for (let i = 0; i < ringSize; i++) {
    ringDevices.add(devices[i]);
  }
  return { devices, ringDevices };
}

function makeIpPool(rng: Rng, size: number, ringSize: number): { ips: string[]; ringIps: Set<string> } {
  const ips: string[] = [];
  for (let i = 0; i < size; i++) {
    ips.push('IP_' + i.toString(36).padStart(6, '0').toUpperCase());
  }
  const ringIps = new Set<string>();
  for (let i = 0; i < ringSize; i++) {
    ringIps.add(ips[i]);
  }
  return { ips, ringIps };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  seed: number;
  /** Approximate number of transactions to generate. */
  count: number;
  /** Number of merchants in the universe. */
  merchantCount?: number;
  startTs?: number;
}

export interface GeneratedDataset {
  transactions: Transaction[];
  customers: CustomerProfile[];
  merchantCategories: Record<string, string>;
}

export function generateDataset(opts: GenerateOptions): GeneratedDataset {
  const rng = new Rng(opts.seed);
  const count = Math.max(100, opts.count);
  const merchantCount = opts.merchantCount ?? 6;
  const startTs = opts.startTs ?? Date.UTC(2024, 0, 1); // Jan 1 2024 UTC

  // merchants
  const merchants: { id: string; category: string }[] = [];
  for (let i = 0; i < merchantCount; i++) {
    merchants.push({
      id: 'MERCH_' + i.toString(36).padStart(4, '0').toUpperCase(),
      category: rng.pick(PRODUCT_CATEGORIES).name,
    });
  }
  const merchantCategories: Record<string, string> = {};
  merchants.forEach((m) => (merchantCategories[m.id] = m.category));

  const customerPool = makeCustomerPool(rng, Math.floor(count * 0.35) + 200);
  const { devices, ringDevices } = makeDevicePool(rng, 400, 28);
  const { ips, ringIps } = makeIpPool(rng, 400, 28);

  // Behavioural trackers (sliding state, rebuilt deterministically)
  const deviceWindow: Map<string, number[]> = new Map(); // deviceId -> list of ts in last 24h
  const ipWindow: Map<string, number[]> = new Map();
  const customerWindow: Map<string, number[]> = new Map(); // customerId -> ts of orders last 7d (and we slice for 1h/24h)
  const customerDevices: Map<string, Set<string>> = new Map();

  // Festival lookup by day-of-year
  const festivalLookup: { name: string; lift: number }[] = new Array(366).fill(null).map(() => ({ name: '', lift: 1 }));
  for (const f of FESTIVAL_WINDOWS) {
    for (let d = f.start; d <= f.end; d++) {
      festivalLookup[d] = { name: f.name, lift: f.lift };
    }
  }

  // Generate the *arrival times* with a non-uniform rate (daily + festival lift)
  // We use a thinning approach: draw candidate ts and accept with festival-lift prob.
  const transactions: Transaction[] = [];
  const oneDayMs = 86400000;
  const horizonDays = Math.max(60, Math.ceil(count / 220)); // ~220 orders/day baseline

  // Pre-draw per-day volume so festival spikes are visible in the time series
  const dayVolume: number[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const dayOfYear = (d % 365) + 1;
    const f = festivalLookup[dayOfYear];
    const weekendLift = (dayOfYear % 7 === 0 || dayOfYear % 7 === 6) ? 1.15 : 1.0;
    const base = 220;
    const vol = Math.round(base * f.lift * weekendLift * (0.85 + rng.uniform() * 0.3));
    dayVolume.push(vol);
  }

  let customerCursor = customerPool.length; // start after pool to avoid ID collisions
  let orderId = 0;

  for (let day = 0; day < horizonDays && transactions.length < count; day++) {
    const dayTs = startTs + day * oneDayMs;
    const dayOfYear = (day % 365) + 1;
    const fest = festivalLookup[dayOfYear];
    const todaysVolume = Math.min(dayVolume[day], count - transactions.length);

    for (let n = 0; n < todaysVolume; n++) {
      // hour-of-day: bias to 10:00-22:00 with a smaller late-night tail
      const hourDraw = rng.uniform();
      let hour: number;
      if (hourDraw < 0.62) hour = 10 + Math.floor(rng.uniform() * 12); // 10-21
      else if (hourDraw < 0.82) hour = (6 + Math.floor(rng.uniform() * 4)) % 24; // early
      else hour = (22 + Math.floor(rng.uniform() * 7)) % 24; // late night
      const minute = rng.int(0, 59);
      const ts = dayTs + hour * 3600000 + minute * 60000;

      // choose customer: 78% returning, 22% brand-new (matches guest ratio ~ but separate)
      const isNewCustomer = rng.bernoulli(0.18);
      let customer: CustomerProfile;
      if (isNewCustomer || customerPool.length === 0) {
        customer = {
          customerId: 'CUST_' + customerCursor.toString(36).padStart(6, '0').toUpperCase(),
          accountAgeDays: rng.bernoulli(0.7) ? 0 : rng.int(1, 6),
          isGuest: rng.bernoulli(0.5),
          totalOrders: 0,
          returnedOrders: 0,
          chargebackOrders: 0,
          lifetimeValue: 0,
          firstSeenDay: day,
          paymentMethodPreference: (() => {
            const prefs = rng.pick([
              ['UPI'],
              ['UPI', 'COD'],
              ['UPI', 'Credit Card'],
              ['COD'],
            ] as PaymentMethod[][]);
            const m: Partial<Record<PaymentMethod, number>> = {};
            prefs.forEach((p, i) => (m[p] = i === 0 ? 0.6 : 0.4));
            return m;
          })(),
        };
        customerPool.push(customer);
        customerCursor++;
      } else {
        // pick an existing customer weighted by recency-free uniform (cheap, deterministic enough)
        customer = customerPool[rng.int(0, customerPool.length - 1)];
      }

      // merchant + category
      const merchant = rng.pick(merchants);
      const cat = rng.pick(PRODUCT_CATEGORIES);

      // device / IP
      // ~7% of orders come from a "ring" device/IP (coordinated abuse), biased to new customers & guests
      const ringBias = customer.isGuest ? 0.14 : isNewCustomer ? 0.10 : 0.05;
      const useRingDevice = rng.bernoulli(ringBias);
      const deviceId = useRingDevice
        ? rng.pick([...ringDevices])
        : rng.pick(devices);
      const ipHash = useRingDevice ? rng.pick([...ringIps]) : rng.pick(ips);

      // update windows (push current ts)
      pushWindow(deviceWindow, deviceId, ts, oneDayMs);
      pushWindow(ipWindow, ipHash, ts, oneDayMs);
      pushWindow(customerWindow, customer.customerId, ts, 7 * oneDayMs);

      const customerPriorOrders = customer.totalOrders;
      const customerPriorReturns = customer.returnedOrders;
      const customerPriorChargebacks = customer.chargebackOrders;
      const customerReturnRate = customerPriorOrders > 0 ? customerPriorReturns / customerPriorOrders : 0;
      const customerChargebackRate = customerPriorOrders > 0 ? customerPriorChargebacks / customerPriorOrders : 0;
      const customerLtv = customer.lifetimeValue;

      const customerOrdersLast1h = countWindow(customerWindow, customer.customerId, ts, 3600000);
      const customerOrdersLast24h = countWindow(customerWindow, customer.customerId, ts, oneDayMs);
      const customerOrdersLast7d = countWindow(customerWindow, customer.customerId, ts, 7 * oneDayMs);
      const customerVelocity7d = customerOrdersLast7d / 7;
      const timeSinceLastOrderHours =
        customerPriorOrders === 0 ? null : (ts - (customerWindow.get(customer.customerId)?.slice(-2, -1)[0] ?? ts)) / 3600000;

      const deviceSeenCount24h = countWindow(deviceWindow, deviceId, ts, oneDayMs);
      const ipSeenCount24h = countWindow(ipWindow, ipHash, ts, oneDayMs);

      // customer's known devices
      if (!customerDevices.has(customer.customerId)) customerDevices.set(customer.customerId, new Set());
      const knownDevices = customerDevices.get(customer.customerId)!;
      const isNewDeviceForCustomer = !knownDevices.has(deviceId);
      knownDevices.add(deviceId);

      // payment method: weighted by customer preference + festival shift toward COD/prepaid
      const paymentMethod = choosePayment(rng, customer, cat);

      // amount
      const baseAmount = cat.avgPrice * rng.uniformRange(0.6, 2.2);
      const quantity = weightedQuantity(rng, cat.name);
      const amount = Math.round(baseAmount * quantity);

      // shipping / billing geography
      const shipCity = rng.pick(INDIAN_CITIES);
      const billingCity = rng.bernoulli(0.88) ? shipCity : rng.pick(INDIAN_CITIES);
      const addressMismatch = billingCity.city !== shipCity.city;

      const isFestivalPeriod = fest.name !== '';
      const isWeekend = (dayOfYear % 7 === 0 || dayOfYear % 7 === 6);
      const isNightTime = hour >= 22 || hour < 5;

      // assemble the feature-only transaction (no label yet)
      const txBase: Omit<Transaction, 'hadChargebackOrRto' | 'outcomeKind' | 'lossAmount' | 'split'> = {
        id: 'TX_' + orderId.toString(36).padStart(7, '0').toUpperCase(),
        ts,
        dayOfYear,
        hour,
        merchantId: merchant.id,
        merchantCategory: merchant.category,
        customerId: customer.customerId,
        isGuest: customer.isGuest,
        customerAccountAgeDays: isNewCustomer ? 0 : Math.min(customer.accountAgeDays, day - customer.firstSeenDay + customer.accountAgeDays),
        customerPriorOrders,
        customerPriorReturns,
        customerPriorChargebacks,
        customerReturnRate,
        customerChargebackRate,
        customerLtv,
        amount,
        quantity,
        category: cat.name,
        categoryBaseRisk: cat.baseRisk,
        isHighValueCategory: cat.avgPrice > 5000,
        paymentMethod,
        isCod: paymentMethod === 'COD',
        isPrepaid: paymentMethod !== 'COD',
        isUpi: paymentMethod === 'UPI',
        isEmi: paymentMethod === 'EMI',
        isGiftCard: cat.name === 'Gift Cards',
        shippingCity: shipCity.city,
        shippingTier: shipCity.tier,
        shippingState: shipCity.state,
        billingCity: billingCity.city,
        addressMismatch,
        deviceId,
        deviceSeenCount24h,
        ipHash,
        ipSeenCount24h,
        customerOrdersLast1h,
        customerOrdersLast24h,
        customerOrdersLast7d,
        customerVelocity7d,
        timeSinceLastOrderHours,
        isNewDeviceForCustomer,
        isFestivalPeriod,
        festivalName: fest.name || null,
        isWeekend,
        isNightTime,
      };

      // sample the true label from the latent risk
      const p = latentRisk(txBase);
      const hadChargebackOrRto = rng.bernoulli(p);

      // outcome kind: when positive, split between chargeback / rto / return_fraud
      // using a distribution that depends on payment method & category
      let outcomeKind: Transaction['outcomeKind'] = 'clean';
      let lossAmount = 0;
      if (hadChargebackOrRto) {
        // COD orders almost always RTO; gift cards -> chargeback; prepaid high-value -> chargeback; else mix
        if (txBase.isCod) {
          outcomeKind = 'rto';
        } else if (txBase.isGiftCard) {
          outcomeKind = 'chargeback';
        } else if (txBase.paymentMethod === 'Credit Card' || txBase.paymentMethod === 'EMI') {
          outcomeKind = rng.bernoulli(0.6) ? 'chargeback' : 'return_fraud';
        } else {
          const roll = rng.uniform();
          if (roll < 0.4) outcomeKind = 'chargeback';
          else if (roll < 0.75) outcomeKind = 'rto';
          else outcomeKind = 'return_fraud';
        }
        // loss amount: for RTO it's mainly logistics + lost margin; for chargeback it's full amount + fee
        if (outcomeKind === 'rto') {
          lossAmount = Math.round(amount * 0.18 + 180); // shipping both ways + handling
        } else if (outcomeKind === 'chargeback') {
          lossAmount = Math.round(amount + 150 + amount * 0.02); // merchandise + chargeback fee + processing
        } else {
          // return_fraud: item returned but unusable / swapped
          lossAmount = Math.round(amount * 0.55 + 120);
        }
      }

      // mutate customer profile (only after computing features — features use PRIOR state)
      customer.totalOrders += 1;
      if (hadChargebackOrRto) {
        if (outcomeKind === 'chargeback') customer.chargebackOrders += 1;
        else customer.returnedOrders += 1; // rto + return_fraud count as returns
      }
      if (!hadChargebackOrRto) customer.lifetimeValue += amount;
      if (customer.firstSeenDay === 0 && !isNewCustomer) customer.firstSeenDay = Math.max(0, day - customer.accountAgeDays);

      transactions.push({
        ...txBase,
        hadChargebackOrRto,
        outcomeKind,
        lossAmount,
      });
      orderId++;
    }
  }

  // trim any excess
  transactions.length = Math.min(transactions.length, count);

  return { transactions, customers: customerPool, merchantCategories };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pushWindow(map: Map<string, number[]>, key: string, ts: number, windowMs: number) {
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  arr.push(ts);
  // prune
  const cutoff = ts - windowMs;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

function countWindow(map: Map<string, number[]>, key: string, ts: number, windowMs: number): number {
  const arr = map.get(key);
  if (!arr) return 0;
  const cutoff = ts - windowMs;
  // we count distinct occurrences (timestamps) within window; since each push is an order, length works
  let c = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] >= cutoff && arr[i] <= ts) c++;
    else if (arr[i] < cutoff) break;
  }
  return c;
}

function choosePayment(rng: Rng, customer: CustomerProfile, cat: { name: string }): PaymentMethod {
  // Build a weighted distribution
  const weights: Record<PaymentMethod, number> = {
    UPI: 0.42,
    'Credit Card': 0.13,
    'Debit Card': 0.1,
    'Net Banking': 0.05,
    COD: 0.22,
    Wallet: 0.06,
    EMI: 0.02,
  };
  // apply customer preference
  for (const k of Object.keys(customer.paymentMethodPreference) as PaymentMethod[]) {
    const w = customer.paymentMethodPreference[k] ?? 0;
    weights[k] = (weights[k] ?? 0) * (1 + w);
  }
  // high-value & electronics tilt toward EMI / Credit Card; gift cards disallow COD
  if (cat.name === 'Gift Cards') {
    weights.COD = 0;
    weights.EMI = 0;
    weights['Credit Card'] *= 1.4;
    weights.UPI *= 1.3;
  }
  if (cat.name === 'Electronics' || cat.name === 'Mobiles & Tablets' || cat.name === 'Appliances') {
    weights.EMI *= 2.5;
    weights['Credit Card'] *= 1.3;
  }
  if (cat.name === 'Grocery' || cat.name === 'Books') {
    weights.UPI *= 1.4;
    weights.COD *= 0.6;
  }
  // normalize
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng.uniform() * total;
  for (const k of Object.keys(weights) as PaymentMethod[]) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'UPI';
}

function weightedQuantity(rng: Rng, cat: string): number {
  // most orders are 1 item; fashion/beauty sometimes 2-3; grocery can be larger
  if (cat === 'Grocery') return rng.bernoulli(0.5) ? 1 : rng.int(2, 6);
  if (cat === 'Fashion' || cat === 'Beauty & Personal Care') {
    if (rng.bernoulli(0.7)) return 1;
    return rng.int(2, 4);
  }
  if (rng.bernoulli(0.92)) return 1;
  return rng.int(2, 3);
}
