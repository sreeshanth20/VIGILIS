# AEGIS Build Worklog

This file tracks the progress of all agents working on the AEGIS project.

---
Task ID: 1
Agent: main (orchestrator)
Task: Build pure-TS ML core (RNG, data generator, features, GBDT, metrics, inference) and train model

Work Log:
- Created `src/lib/ml/rng.ts` — mulberry32 seeded PRNG (deterministic, reproducible)
- Created `src/lib/ml/data.ts` — synthetic Indian e-commerce transaction generator with realistic BFSI patterns: UPI/COD payment mix, RTO behaviour, metro/tier-2/3 geography, festival volume spikes, fraud rings (shared device/IP), customer longitudinal history, latent risk with non-linear interactions (abuse-ring amplifier, sweet-spot account-age non-monotonicity, festival ring pattern, gift-card first-party fraud)
- Created `src/lib/ml/features.ts` — 41 features across 6 groups (customer, order, payment, behavior, geography, temporal), each with human-readable description for explainability
- Created `src/lib/ml/tree.ts` — CART regression tree with histogram-based quantile splits, L2-regularised leaf values
- Created `src/lib/ml/gbdt.ts` — gradient-boosted decision trees (logistic loss), row/column subsampling, early stopping on validation PR-AUC, per-prediction feature contributions (tree-path based, SHAP-lite), ROC-AUC, PR-AUC, calibration, threshold sweep
- Created `src/lib/ml/inference.ts` — model artifact schema, persistence, loading, scoring, explanation API
- Created `scripts/train.ts` — reproducible training pipeline (seed=20240117, 24000 transactions, 70/15/15 temporal split), trains both GBDT and logistic baseline, evaluates on held-out test set, writes model.json + eval.json
- Fixed two critical bugs during training: (1) ROC-AUC was sorting descending but rank formula expected ascending (inverted AUC); (2) leaf value formula used `-mean/(n+lambda)` instead of `-sum/(n+lambda)` (off by factor of n, making leaf values tiny)

Stage Summary:
- Trained model artifact at `src/lib/ml/artifacts/model.json`
- Held-out test metrics: ROC-AUC=0.8311, PR-AUC=0.7770, F1=0.713 @ threshold 0.35 (precision=0.636, recall=0.766)
- Logistic baseline: ROC-AUC=0.8335, PR-AUC=0.7824 (competitive — honest finding, will be presented in UI)
- Test set genuinely held-out: used only for final evaluation, never for model selection
- Positive rate ~7% (realistic for chargeback+RTO in Indian e-commerce)
- Model is fully reproducible from seed; no external dependencies

---
Task ID: 2-3
Agent: main (orchestrator)
Task: Build Prisma schema, seed DB, API routes, and full frontend (5 views)

Work Log:
- Defined Prisma schema (`prisma/schema.prisma`) with Transaction model (all features + risk score + top factors + outcome + decision) and AuditLog; pushed to SQLite
- Wrote `scripts/seed.ts` — generates the same dataset (seed 20240117), scores every transaction with the trained model, computes top-8 feature contributions, marks most recent 7 days as "pending" outcome, persists 24,000 transactions
- Built business-impact library (`src/lib/business.ts`) — threshold simulation, prevented loss, false-positive cost, investigation cost, net savings, INR formatting, risk-band definitions
- Built API routes: `/api/overview`, `/api/queue` (paginated/filtered/sortable), `/api/tx/[id]` (detail), `/api/tx/[id]/related` (same customer/device/IP ring analysis), `/api/tx/[id]/decision` (approve/hold/escalate/dismiss + audit log), `/api/threshold` (impact simulation + sweep), `/api/model` (full model performance), `/api/brief` (LLM analyst brief with rule-based fallback)
- Designed premium dark theme in `globals.css` — warm charcoal surfaces, burnt-amber accent, risk-band color tokens (critical/high/elevated/normal), custom scrollbar, ambient grid, pulse animation
- Built app shell with sidebar nav (4 views) + model-status panel + mobile nav + sticky footer
- Built 5 views: Overview (KPIs, trend chart, risk distribution, financial impact, top-risk table, merchant/category breakdown), Queue (filterable/sortable/paginated table with band/status/search filters), Investigation (slide-in drawer with risk score, financial impact, feature contributions, behavioural signals, customer history, LLM analyst brief, decision panel), ThresholdTuner (interactive slider + 4 trade-off curves + confusion matrix), ModelPerformance (ROC, PR, confusion, calibration, training history, feature importances, spec)
- Used TanStack Query for server state, Zustand for view state, Recharts for charts, Framer Motion for transitions
- Converted all chart colors from oklch to hex (headless Chromium doesn't paint oklch in SVG presentation attributes reliably)

Verification (Agent Browser):
- Overview loads with 24,000 transactions, ₹1.01Cr pending exposure, ₹2.13Cr prevented loss, 4 risk bands
- Clicked a critical transaction → investigation drawer opens with all 7 sections populated
- Generated LLM analyst brief → grounded explanation citing real features (guest checkout +51.4%, new account +27.6%, device seen 3× +27.9%)
- Recorded Hold decision → toast confirmation, decision persisted
- Threshold Tuner loads with slider at 35% default, all 4 curves render
- Model Performance loads with all metrics (ROC-AUC 0.831, PR-AUC 0.777), confusion matrix, calibration, feature importances
- Zero console errors across all views

Stage Summary:
- Full end-to-end product working: data → model → API → interactive UI
- 4 main views + investigation drawer all functional
- Real ML predictions driving the UI (not hardcoded)
- LLM brief works with rule-based fallback
- Decision actions persist to DB with audit log
- Premium dark visual design with amber accents

---
Task ID: 6-9
Agent: main (orchestrator)
Task: Tests, self-review, README, packaging

Work Log:
- Wrote 45 tests covering RNG, data generator, feature engineering, GBDT metrics, inference, and business logic — all passing
- Fixed customer ID collision bug in data generator (new customers created mid-generation were colliding with pool customer IDs)
- Fixed lint error (setState-in-effect) by moving page reset into click handlers
- Converted all chart colors from oklch to hex (headless Chromium doesn't paint oklch in SVG presentation attributes reliably; verified via DOM inspection that charts DO render: SVG display=block, opacity=1, bars at rgb(234,111,47) with visible bounding boxes)
- Fixed .env to use relative DB path (file:./db/custom.db) so it works after ZIP extraction
- Added train/seed/test scripts to package.json
- Wrote comprehensive README.md (product overview, ML methodology, architecture, project structure, setup, testing, security, limitations, design system)
- Verified all 4 views load without console errors
- Verified investigation flow: click transaction → drawer opens → all 7 sections populate → LLM brief generates grounded explanation → decision recorded with toast + audit log
- Verified threshold tuner: slider updates projected impact live (precision/recall/F1/prevented-loss/FP-cost/net-savings)
- Verified mobile responsiveness (390px viewport) — single-column layout, mobile nav, no horizontal overflow
- Cleaned project: removed node_modules, .next, dev.log, scaffold folders (examples, mini-services, skills, download, .zscripts)
- Created final ZIP: aegis-merchant-loss-defense.zip (4.7MB, 106 files)

Stage Summary:
- Final ZIP: /home/z/my-project/aegis-merchant-loss-defense.zip
- 45 tests passing, 0 lint errors, 0 runtime errors
- Complete product: data → model → API → interactive UI
- Real ML (GBDT, held-out test, honest metrics, explainability)
- Premium dark UI with amber accents
- Fully local (no paid APIs, no external services for core)
- Immediately runnable after extraction: bun install && bun run dev
