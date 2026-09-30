# Global Discovery Ranking evaluation

Run `npm run evaluate:global-ranking` to print the fixed representative snapshot scorecard and the current release decision. Run `npm run evaluate:global-ranking -- --write` to refresh the checked-in `global-discovery-ranking-v1.json` report. The fixture set and concise rubric notes live in `lib/global-ranking-evaluation-fixtures.ts`; it uses no live source APIs or model calls. These are synthetic representative examples, not captured production history, and their rubric ratings require independent product review before approval. The output includes reviewable Selection Snapshot fields, evidence excerpts, public Ranking Reasons, and criterion assessments. It intentionally strips any fields outside the accepted Evidence Record shape, including model chain-of-thought.

Each fixture is scored from 1–5 for freshness, credibility, usefulness, diversity, and explanation accuracy. A criterion is positive when the fixture mean is at least 4.0. At least four positive criteria make the scorecard eligible for approval, but never enable the policy by themselves.

The model-ranking and evidence-enrichment path is disabled by default; deterministic fallback remains operational. Enabling the model path requires all three explicit operator settings, bound to the exact scorecard printed by the command:

- `GLOBAL_DISCOVERY_RANKING_APPROVED_SCORECARD_ID`: the scorecard ID reviewed by the product approver.
- `GLOBAL_DISCOVERY_RANKING_APPROVED_BY`: the accountable approver's identity.
- `GLOBAL_DISCOVERY_RANKING_APPROVED_AT`: an ISO timestamp strictly later than the scorecard's `evaluatedAt`.

Missing, partial, invalid, stale, or mismatched approval fails closed. Until then, scheduled ingestion continues with deterministic fallback and skips model ranking and evidence enrichment. This ticket does not authorize setting approval values, deployment, or automatic enablement.
