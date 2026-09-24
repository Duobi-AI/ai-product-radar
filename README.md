# AI Product Radar

A small, personal discovery feed for early AI launches, betas, waitlists, demos, and open-source projects. The feed is public to anyone with its URL; Google sign-in stores recommendation feedback separately for each account.

## Sources

- **Product Hunt** — recent posts from its public GraphQL API. Provide a developer access token and keep Product Hunt attribution on source links.
- **Show HN** — stories from Hacker News' public Firebase API.
- **GitHub** — recently created AI repositories, used as a practical proxy for trending projects because GitHub does not publish an official trending API.
- **Hugging Face** — recently created Spaces from the Hub API.

Each daily run searches a rolling window, merges mentions sharing a product website, and stores links to the original sources. BetaList is intentionally not automated until API/display permission is confirmed. Collection uses source descriptions and metadata; it does not rewrite products with an LLM.

## Run locally

1. Install Node.js 22+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill the variables below.
3. Create a Neon Postgres database, then run `npm run db:push`.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | Yes | Random secret for signing auth cookies; generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Yes | Site origin, e.g. `http://localhost:3000` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Yes for sign-in | Google OAuth web client credentials |
| `CRON_SECRET` | Yes in deployment | Random bearer secret for the Vercel daily job |
| `PRODUCT_HUNT_TOKEN` | Recommended | Product Hunt API access token |
| `GITHUB_TOKEN` | Optional | Raises GitHub REST API search rate limits |
| `AI_RANKING_MODEL` | Optional | Vercel AI Gateway model for daily and personalized ranking; defaults to Gemini 2.5 Flash Lite |

Set the Google OAuth authorized redirect URI to `http://localhost:3000/api/auth/callback/google` locally and `https://YOUR_DOMAIN/api/auth/callback/google` in production. The Better Auth callback endpoint is the same for each deployment origin.

## Daily collection

Vercel Hobby schedules are hour-wide and interpreted in UTC. `vercel.json` invokes the collector at 19:00 and 20:00 UTC; the route checks the local Pacific hour and continues only during noon–1pm. This pair covers standard and daylight time. The run is idempotent for each Pacific date. A signed-in user can also trigger a manual refresh from the feed.

## Recommendation feedback

"More" and "Less" feedback is stored per signed-in account. The daily collector uses a language model to choose and order up to 30 filtered, deduplicated products. The "For you" view uses the same model with the account's feedback and reasons to rerank matching products. Ranking uses Vercel AI Gateway through the AI SDK; Vercel deployments use project OIDC authentication. Model requests consume token usage at the selected model's current rates. The Signals page summarizes preferences and allows reset. Feedback affects personal recommendations, not source collection or the shared daily order.

## Deployment checklist

1. Connect the Neon Marketplace database to the Vercel project and add its production `DATABASE_URL`.
2. Configure the Google OAuth client and the required Better Auth and cron secrets in Vercel.
3. Add Product Hunt credentials if available, then configure GitHub token if needed.
4. Pull production variables locally and run `npm run db:push` once to create tables.
5. Deploy and trigger a signed-in manual refresh to seed the feed.

Environment values are not committed. `.env.local` is gitignored.
