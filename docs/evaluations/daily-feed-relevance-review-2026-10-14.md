# Daily Feed relevance review — 2026-10-14

## Scope and method

This is a fixed, qualitative review of the public Daily Feed, not a production-history evaluation or a measured false-positive rate. Seven fixture names and shortened descriptions come from the [public feed](https://ai-product-radar-gilt.vercel.app/) viewed on 2026-10-14. Two more fixtures are explicit boundary cases: `Orbit` preserves the existing Product Hunt topic-only behavior in `tests/daily-candidates.test.ts`, and `Trail Journal` checks an unrelated non-AI listing. The public page does not expose raw collector metadata; Product Hunt `Artificial Intelligence` topics in the fixtures are modeled from the collector's topic query, not claimed as verified metadata for each live listing.

Run `npx tsx scripts/review-daily-eligibility.ts` to reproduce the table. The review calls `prepareDailyCandidates` with a fixed clock. Its comparison candidate removes metadata from the AI-relevance text, requiring the name or description to mention AI. That is an analysis only; production eligibility is unchanged.

| Fixture | Cohort | Review label | Current | Visible-copy-only candidate |
| --- | --- | --- | --- | --- |
| Agent-Native | clear AI Product | include | include | include |
| Simple Agent Store | clear AI Product | include | include | include |
| Pulse Local | clear AI Product | include | include | include |
| Orbit | topic-only AI Product | include | include | exclude |
| Best Automation Tools for Freelancers | guide or resource | exclude | include | exclude |
| Building an LLM from Scratch in TypeScript | guide or resource | exclude | include | include |
| AI Hub – Open Access Lesson Plans | guide or resource | exclude | include | include |
| pacr running | tangential or unclear AI | uncertain | include | exclude |
| Trail Journal | non-AI Product | exclude | exclude | exclude |

The current and comparison rules each match **5 of 8 labeled fixture decisions**, with one item left uncertain. The comparison removes one apparent guide false positive but loses the existing topic-only Product Hunt boundary case. It also does not remove the LLM learning book or the AI lesson-plan directory. The `pacr running` description does not establish whether AI drives the coaching feature, so its inclusion is an open question rather than a confirmed error. The fixture labels are editorial judgments on visible copy, not user research.

## Decision

Keep `prepareDailyCandidates` unchanged. A visible-copy-only rule gives no net improvement on this small set and would reverse a deliberately tested eligibility behavior. Keyword exclusions for *guide*, *book*, or *lesson plans* would be easy to evade and could hide genuine AI learning products. The separate Global Discovery Ranking release gate remains the proper place to evaluate whether richer official Evidence Records improve feed credibility; this review does not authorize enabling that policy.

For a later eligibility change, capture raw source metadata and official product pages for a larger, independently labeled sample across all four sources. Judge AI functionality and standalone Product shape separately, then compare precision and valid-product losses at the `prepareDailyCandidates` seam before changing the rule.

## Public examples

- [Agent-Native](https://www.producthunt.com/products/agent-native-2) and [Simple Agent Store](https://www.producthunt.com/products/simple-agent-store): clear AI or agent functionality.
- [Pulse Local](https://news.ycombinator.com/item?id=50080275): consumer app with local AI models, a valid non-developer edge case.
- [Best Automation Tools for Freelancers](https://www.producthunt.com/products/best-automation-tools-for-freelancers): the visible description calls it a practical guide.
- [Building an LLM from Scratch in TypeScript](https://news.ycombinator.com/item?id=50085332) and [AI Hub lesson plans](https://news.ycombinator.com/item?id=50081297): AI-related learning resources rather than clearly standalone AI Products.
- [pacr running](https://www.producthunt.com/products/pacr-running): visible copy does not establish the AI role.
