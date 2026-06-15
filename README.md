# App Name Trademark Checker

A small Next.js website that checks whether an app name collides with a
registered **US trademark**, using live data from the USPTO trademark register.

## How it works

- The browser calls an internal API route (`/api/search`).
- The route (server-side) queries the trademark provider in `lib/uspto.ts` and
  keeps your API key secret.
- The UI shows a clear verdict (live exact-match conflict vs. no exact match)
  plus every matching mark with its status, owner, and dates.

### Why not call USPTO directly?

USPTO's own search backend (`tmsearch.uspto.gov`) sits behind Akamai
bot-protection and resets server-side connections, so a website can't call it
reliably. We use the RapidAPI **uspto-trademark** bridge instead, which returns
the same live USPTO records over a clean JSON API. The upstream call is isolated
in `lib/uspto.ts` — swap it there if you adopt a different source.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste your RapidAPI key
npm run dev
```

Get a free key: sign up at [rapidapi.com](https://rapidapi.com), subscribe to the
free tier of the [USPTO Trademark API](https://rapidapi.com/pentaclethemes/api/uspto-trademark),
and copy your `X-RapidAPI-Key` into `.env.local` as `RAPIDAPI_KEY`.

Open http://localhost:3000.

## Deploy (Vercel)

1. Push this folder to a GitHub repo (private is fine).
2. At [vercel.com](https://vercel.com), sign in with GitHub → **Add New → Project**
   → import the repo. Next.js is auto-detected; no build settings needed.
3. In the project's **Settings → Environment Variables**, add
   `RAPIDAPI_KEY` = your key. (It is never committed — it lives only as a Vercel
   secret on the server.)
4. **Deploy.** You get a public URL like `your-app.vercel.app`. Every `git push`
   to the default branch auto-redeploys.

### Quota protection (already built in)

The free RapidAPI plan allows **250 requests/month, shared across all visitors**,
so the app guards it:

- **Caching** (`lib/cache.ts`) — identical searches are served from memory for
  24h and don't spend the quota.
- **Per-IP rate limiting** (`lib/rateLimit.ts`) — 12 searches/minute per visitor,
  so one tab or script can't drain the month.

Both are **in-memory and best-effort**: on Vercel each serverless instance has
its own memory and cold starts reset it, so they reduce — but don't perfectly
bound — usage across instances.

### Scaling beyond the free quota

- Raise the RapidAPI plan (paid tiers offer ~10k+ requests/month).
- For a *hard*, shared cache and rate limit across all instances, back
  `lib/cache.ts` and `lib/rateLimit.ts` with [Upstash Redis](https://upstash.com)
  (free tier available) — both modules are isolated for exactly this swap.

## Notes & limitations

- Covers **US** trademarks only (USPTO). No EU/EUIPO or international coverage.
- The "conflict" verdict only flags a **live, exact** word-mark match. Similar or
  phonetically close marks can still pose legal risk — the full result list is
  shown so you can judge.
- Informational only — **not legal advice.** Consult a trademark attorney before
  launching a name.
