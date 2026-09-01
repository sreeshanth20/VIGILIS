# VIGILIS — AI Risk Intelligence

> Real-time fraud detection and chargeback risk assessment for enterprise transactions.

VIGILIS is an advanced **AI-powered risk intelligence platform** that predicts the probability of fraudulent transactions, chargebacks, and high-cost returns with a real gradient-boosted model, honest held-out evaluation, per-prediction explainability, financial-impact reasoning, and a premium investigation workflow.

The system is **strictly defense-only**. It exposes no offensive capability. All analyst actions are protective (hold / escalate / approve / dismiss) and are written to an append-only audit log.

---

## What it does

VIGILIS is an intelligent risk assessment engine. For every transaction it computes:

1. A **risk probability** from a genuine gradient-boosted decision-tree model (219 trees, trained locally).
2. A **risk band** (critical / high / elevated / normal) relative to a configurable operating threshold.
3. The **top contributing factors** for that specific prediction (tree-path-based feature attribution, SHAP-lite).
4. The **expected financial loss** for the transaction, grounded in historical data and outcomes.
5. **Behavioral & anomaly signals** — device patterns, customer velocity, geographic mismatches.
6. The **customer's history** of prior transactions, returns, and risk events.

An analyst moves naturally from a high-level risk overview → the risk queue → an investigation drawer → an actionable decision. An optional LLM-generated **analyst brief** synthesises the model explanation into natural language (with a deterministic rule-based fallback so the feature always works offline).

A **threshold tuner** lets the analyst simulate the business impact of changing the operating point: precision / recall / F1, prevented loss, false-positive cost, investigation workload, and net savings — all grounded in the realised transaction history.

A **model performance** view reports honest held-out metrics (ROC-AUC, PR-AUC, confusion matrix, calibration, training history, feature importances) alongside a logistic-regression baseline for transparent comparison.

---

## The ML system

The entire machine-learning pipeline is implemented **from scratch in pure TypeScript** — no Python, no external ML runtime, no paid API. This keeps the system fully local-first and reproducible.

### Pipeline

| Stage | File | What it does |
|-------|------|--------------|
| Seeded RNG | `src/lib/ml/rng.ts` | mulberry32 PRNG — every step is reproducible from a single seed |
| Synthetic data | `src/lib/ml/data.ts` | Generates a realistic transaction stream with a known latent risk process |
| Feature engineering | `src/lib/ml/features.ts` | 41 features across 6 groups; identical transform at train & inference time |
| Decision tree (CART) | `src/lib/ml/tree.ts` | Histogram-based quantile splits, L2-regularised leaf values |
| Gradient boosting | `src/lib/ml/gbdt.ts` | Logistic-loss GBDT with row/column subsampling, early stopping, per-prediction contributions |
| Inference service | `src/lib/ml/inference.ts` | Loads the trained artifact, scores transactions, returns explanations |
| Training script | `scripts/train.ts` | Reproducible training + held-out evaluation; writes `model.json` + `eval.json` |
| DB seeder | `scripts/seed.ts` | Scores every transaction with the trained model, persists to SQLite |

### The data

A reproducible synthetic generator (`seed = 20240117`) produces **24,000 transactions** across a 92-day horizon, grounded in realistic transaction mechanics:

- **Geography**: 38 Indian cities across tier 1/2/3, with tier-3 carrying elevated RTO risk
- **Payments**: UPI / COD / Credit Card / Debit Card / Net Banking / Wallet / EMI with realistic mix and category-dependent shifts
- **Products**: 12 categories with distinct base-risk profiles (gift cards and jewellery are highest)
- **Festivals**: Republic Day, Holi, Big Billion Days, Diwali, Christmas — drive volume and fraud spikes
- **Customers**: longitudinal history (account age, prior orders, return rate, chargeback history, LTV)
- **Abuse rings**: ~7% of orders originate from a small pool of shared devices / IPs, surfacing as behavioural features
- **Latent risk**: a non-trivial combination of features (including multiplicative abuse-ring amplifiers, non-monotonic account-age effects, and 3-way interactions) that a tree ensemble can capture but a linear model cannot fully represent

The positive rate (~33%) is higher than a typical merchant's because the synthetic merchant is calibrated to a high-risk profile where chargebacks + RTO + return-fraud are combined. The **honest evaluation** on a held-out temporal test set (the most recent 15% of transactions, never used for training or model selection) shows:

| Metric | GBDT | Logistic baseline |
|--------|------|-------------------|
| ROC-AUC | 0.831 | 0.834 |
| PR-AUC | 0.777 | 0.782 |
| F1 @ threshold 0.35 | 0.713 | — |
| Precision @ thr 0.35 | 0.636 | — |
| Recall @ thr 0.35 | 0.766 | — |

The logistic baseline is competitive — a legitimate finding for tabular risk modelling where most signal is additive. The GBDT's advantage appears on the high-risk tail (abuse rings, 3-way interactions) where non-linearity matters. Both models are reported transparently in the UI.

### Explainability

Per-prediction feature contributions are computed via the **tree-path expectation** method (a TreeSHAP-lite approximation): for each tree we walk the decision path and distribute the leaf's contribution across the splitting features. Summing over all trees gives a feature-level attribution whose sum (over all features + the base value) equals the model's logit. The investigation view renders these as positive (risk-increasing) and negative (risk-reducing) bars, each annotated with the feature's actual value for that transaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 16 client)                                │
│  ┌───────────┐  ┌───────────┐  ┌────────────────────────┐  │
│  │ Overview  │  │  Queue    │  │  Investigation drawer  │  │
│  │ Threshold │  │  Model    │  │  (risk factors, brief, │  │
│  │ Tuner     │  │  Perform. │  │   decisions)           │  │
│  └─────┬─────┘  └─────┬─────┘  └───────────┬────────────┘  │
│        │ TanStack Query (server state)      │ Zustand (view)│
└────────┼───────────────────────────────────┼───────────────┘
         │ fetch /api/*                       │
┌────────┼───────────────────────────────────┼───────────────┐
│        ▼  Next.js API routes (App Router)                   │
│  /api/overview  /api/queue  /api/tx/[id]  /api/tx/[id]/     │
│  related  /api/tx/[id]/decision  /api/threshold  /api/model  │
│  /api/brief (LLM, optional)                                 │
│        │                              │                      │
│        ▼                              ▼                      │
│  ┌──────────┐                ┌────────────────┐             │
│  │ Prisma   │                │ VIGILIS ML core  │             │
│  │ (SQLite) │                │ (pure TS GBDT)   │             │
│  └──────────┘                └────────────────┘             │
│        │                              │                      │
│        ▼                              ▼                      │
│  24,000 scored           model.json (trained artifact)       │
│  transactions                      + eval.json               │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Recharts, Framer Motion, TanStack Query, Zustand
- **Backend**: Next.js API routes (App Router), Prisma ORM, SQLite
- **ML**: Pure-TypeScript GBDT (no Python, no external ML runtime)
- **Persistence**: SQLite (local file) for transactions + audit log; `model.json` for the trained artifact

---

## Project structure

```
.
├── prisma/
│   └── schema.prisma              # Transaction + AuditLog models
├── scripts/
│   ├── train.ts                   # Reproducible training pipeline
│   └── seed.ts                    # Scores transactions, seeds DB
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── overview/          # Dashboard KPIs + trends
│   │   │   ├── queue/            # Paginated/filtered transaction list
│   │   │   ├── tx/[id]/          # Transaction detail
│   │   │   │   ├── route.ts
│   │   │   │   ├── related/      # Same customer/device/IP ring analysis
│   │   │   │   └── decision/    # Approve/hold/escalate/dismiss
│   │   │   ├── threshold/        # Operating-point simulation
│   │   │   ├── model/            # Held-out metrics + curves
│   │   │   └── brief/           # LLM analyst brief (with fallback)
│   │   ├── globals.css           # Premium dark theme
│   │   ├── layout.tsx
│   │   └── page.tsx              # SPA shell (4 views + investigation)
│   ├── components/
│   │   ├── app/
│   │   │   ├── Shell.tsx         # Sidebar + topbar + footer
│   │   │   ├── Overview.tsx
│   │   │   ├── Queue.tsx
│   │   │   ├── Investigation.tsx # Slide-in drawer
│   │   │   ├── ThresholdTuner.tsx
│   │   │   ├── ModelPerformance.tsx
│   │   │   ├── bits.tsx          # Shared UI (RiskBadge, KpiCard, etc.)
│   │   │   ├── data.ts           # TanStack Query hooks
│   │   │   ├── format.ts         # INR / date / band helpers
│   │   │   └── chartColors.ts    # Hex palette for charts
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── ml/
│       │   ├── rng.ts            # Seeded PRNG
│       │   ├── data.ts           # Synthetic data generator
│       │   ├── features.ts       # 41-feature engineering
│       │   ├── tree.ts           # CART decision tree
│       │   ├── gbdt.ts           # Gradient boosting + metrics
│       │   ├── inference.ts      # Artifact loading + scoring
│       │   └── artifacts/
│       │       ├── model.json    # Trained model (committed)
│       │       └── eval.json     # Training history
│       ├── business.ts          # Threshold impact / financial math
│       ├── api-dto.ts           # Serialization helpers
│       ├── db.ts                # Prisma client
│       ├── store.ts             # Zustand view state
│       └── utils.ts
└── tests/
    └── aegis.test.ts            # 45 tests: RNG, data, features, metrics, inference, business
```

---

## Setup & running locally

### Prerequisites

- **Node.js 18+** or **Bun** (recommended — faster)
- No Python, no Docker, no external services, no API keys required

### Steps

```bash
# 1. Install dependencies
bun install        # or: npm install

# 2. (Optional) Re-train the model from scratch — ~60 seconds
#    This regenerates src/lib/ml/artifacts/model.json
#    A pre-trained artifact is already committed, so this step is optional.
bun run scripts/train.ts

# 3. Push the database schema & seed it with scored transactions — ~7 seconds
bun run db:push
bun run scripts/seed.ts

# 4. Start the dev server
bun run dev       # or: npm run dev

# 5. Open http://localhost:3000
```

### Other commands

```bash
bun run lint      # ESLint
bun test          # Run the test suite (45 tests)
```

---

## Testing

The test suite (`tests/aegis.test.ts`, 45 tests) covers:

- **RNG**: determinism, range, shuffle correctness
- **Data generator**: reproducibility, valid feature values, realistic positive rate, customer-history accumulation, business-rule invariants (e.g., gift cards never use COD)
- **Feature engineering**: feature count, finite values, binary-feature validity, **no future leakage** (verified that prior-count features only use information available before the order)
- **GBDT metrics**: ROC-AUC (perfect / inverted / random / ties), PR-AUC, confusion matrix, precision/recall/F1, monotonic threshold sweep, calibration bins
- **GBDT training**: probabilities in [0,1], beats random on separable data
- **Inference**: artifact loads, held-out metrics present and reasonable, probabilities valid, **feature contributions sum approximates the logit**, feature importances normalise to 1, top importances include known-risky features
- **Business logic**: threshold-impact counting, prevented-loss / FP-cost / investigation-cost formulas, monotonicity, INR formatting, band assignment

Run with `bun test`.

---

## Security

- **Strictly defense-only**: the only analyst actions are `approve`, `hold`, `escalate`, `dismiss`. No offensive capability is exposed anywhere in the codebase.
- **Input validation**: all API routes validate input with Zod schemas.
- **Parameterised queries**: all database access goes through Prisma (no raw SQL).
- **Audit log**: every analyst decision is written to an append-only `AuditLog` table.
- **No secrets**: no API keys, credentials, or machine-specific paths are committed. The LLM brief endpoint gracefully degrades to a deterministic rule-based brief if no SDK key is available.
- **No file uploads**: the system does not accept user-uploaded files.
- **Defense-only data**: the synthetic data generator and model are designed to protect merchants; they cannot be used to perpetrate fraud.

---

## Limitations

- **Synthetic data**: the transaction universe is generated, not real. However, it is grounded in documented Indian e-commerce behaviour (UPI/COD mix, RTO rates, festival spikes, fraud-ring patterns) and the latent risk process is designed to be non-trivially learnable.
- **Single merchant universe**: the demo shows one merchant's data; a production system would ingest per-merchant streams and likely train per-segment models.
- **Positive rate**: the synthetic merchant is calibrated to a high-risk profile (~33% combined chargeback + RTO + return-fraud rate), higher than a typical merchant. This is documented in the UI and the model-performance view.
- **LLM brief**: the analyst brief uses an optional LLM via `z-ai-web-dev-sdk`. If unavailable, it falls back to a deterministic rule-based brief synthesised from the same model explanation — so the feature always works locally.
- **No real-time ingestion**: transactions are seeded once at startup. A production system would ingest a live stream and score in real time.
- **Single threshold**: the system operates on a single global threshold per merchant. Production systems often use per-segment or per-merchant thresholds.

---

## Design system

- **Aesthetic**: premium dark-mode developer-tool (Vercel / Linear / Stripe inspired), matching the challenge brief's visual direction.
- **Surfaces**: warm charcoal (oklch-based design tokens), not pure black.
- **Accent**: burnt amber (`#ef852e`) — defense / signal colour, used for primary actions and the model brand.
- **Risk bands**: critical (red) / high (orange) / elevated (yellow) / normal (emerald) — consistent across UI, API, and charts.
- **Typography**: Geist Sans for UI, Geist Mono with tabular figures for all numeric data.
- **Charts**: Recharts with a hex palette (oklch is unreliable in headless SVG rendering).
- **Responsive**: desktop-first with a mobile nav rail; all views remain usable down to 390px.

---

## License

This project is a technical submission. All code is original and provided as-is.
