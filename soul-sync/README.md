# Soul Sync: proof-of-concept

A daily integration companion. Each day it reads the user's **body** (wearable data), **mind** (a 60-second check-in) and **timing** (sidereal Vedic chart, dasha, transits), then gives them **one aligned action**. Two minutes, then "You're done for today."

> Wellness and self-reflection tool, not medical advice.

## What's in this repo

| Path | What it is | Verified here |
|---|---|---|
| `app/` | React Native + Expo (SDK 58) app for iOS and Android: Onboarding → Today → Check-in → Patterns → You | `tsc` clean; Metro bundles for iOS and Android; `expo prebuild` generates HealthKit entitlement + Health Connect manifest |
| `shared/` | Pure-TypeScript core shared by the app and the server: crisis screen, WHO-5, kind streaks, pattern finding, "did it help" learning, card schema and fallback, sleep merging | 17 unit tests |
| `supabase/` | Postgres schema with row-level security, admin metrics, versioned engine prompt, and edge functions (`daily-card`, `push-cards`, `delete-account`) | Migration + RLS/metrics suite on real Postgres 16; functions pass `deno check` |
| `astro/` | Small Python service: Swiss Ephemeris sidereal chart (Lahiri), Vimshottari dasha, daily transits | 10 tests (ayanamsa, nakshatra boundaries, dasha math, API auth) |
| `admin/` | Static admin dashboard: retention, check-in rate, completion, "it helped", WHO-5 change, session length, and the engine-prompt editor | `node --check` only; needs a live project to click through |

**Not verified yet (needs your accounts and real phones):** an end-to-end run against a live Supabase project and the Anthropic API, HealthKit and Health Connect reads on physical devices, push delivery, and the EAS builds themselves.

## How the brief maps to the code

| Brief | Where |
|---|---|
| Value in the first 60 seconds | Anonymous Supabase session, then birth data, a two-tap check-in and the **first reading on screen 4**, before any account (`app/src/app/onboarding/`) |
| Under 2 minutes a day; "You're done for today" | `today/index.tsx`; session length is measured (`lib/sessionTracking.ts`) and charted against the 120 s target |
| One notification, at the user's time, that *is* the insight | `push-cards` (pg_cron every 15 min) sends the card's own headline. Crisis cards never go to the lock screen. No badges. |
| Kind streaks | `shared/streaks.ts`: "You showed up 9 days this month." Rest days are a button, not a failure. |
| Feeling understood | `shared/patterns.ts` finds true echoes ("You named "restless" two Mondays ago too.") deterministically; the LLM only words them and is told not to invent history |
| Close the loop | Evening "Did it help?" (and yesterday's, if missed). `shared/learning.ts` turns answers into a visible note on the next card: "Breathwork has helped you 3 of 4 times, so today leans that way." |
| Visible progress | Patterns: showed-up count, "what's working for you" weekly recap, recurring feelings, weekday and sleep–mood patterns, WHO-5 vs sleep vs HRV by week |
| Autonomy | Swap (two alternatives), Rest day, Light/Deep mode |
| Small delights | Haptics on selection/completion, shareable card image (`react-native-view-shot`) |
| No dark patterns | No feeds, no badges, no loss language; tests assert streak copy never says "lost/break/miss" |
| HIG / Material 3 | Native tab bar (`expo-router` NativeTabs: UITabBar / Material nav bar), large titles, system fonts, light + dark, 44 pt targets, accessibility roles/labels/states throughout |
| Permissions in context | Notifications asked from the "Turn on my daily card" button; health from "Connect Apple Health / Health Connect"; never at launch |
| Real body data | `app/src/lib/health/index.ios.ts` (HealthKit) and `index.android.ts` (Health Connect): sleep, HRV, resting HR, steps |
| Real Vedic chart | `astro/vedic.py`: Swiss Ephemeris, Lahiri ayanamsa, whole-sign houses, Vimshottari maha/antardasha, Moon and Saturn transits from natal Moon |
| Engine prompt in an admin field | `app_config.engine_prompt`, edited in `admin/`. Every save is versioned; cards record the version, and the dashboard shows "it helped" per version. Safety guardrails are appended in code and can't be edited away. |
| WHO-5 at signup, then weekly | Onboarding baseline + weekly nudge on Today; charted per user and aggregated on the dashboard |
| Crisis language → resources (988) | Screened on device *and* on the server before any card is generated (`shared/crisis.ts`, English + Spanish). Shows 988, Crisis Text Line, 911, findahelpline.com. |
| Export and delete | You → "Export my data" (JSON via the share sheet) and "Delete my account and data" (cascades every table) |
| Admin dashboard | `admin/` + `admin_metrics()` SQL function |

## Setup (about an hour the first time)

### 1. Supabase (free tier)
1. Create a project at supabase.com. Install the CLI: `npm i -g supabase`.
2. `cd soul-sync && supabase link --project-ref <ref> && supabase db push` applies `supabase/migrations/`.
3. Authentication → Providers: enable **Anonymous sign-ins** and **Email**.
4. Secrets for the functions:
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ASTRO_URL=https://<astro-host> ASTRO_API_KEY=<random> CRON_SECRET=<random>
   supabase functions deploy daily-card
   supabase functions deploy delete-account
   supabase functions deploy push-cards --no-verify-jwt
   ```
5. Run `supabase/cron.sql` in the SQL editor (fill in the project ref and `CRON_SECRET`) to send the daily notifications.
6. Make yourself an admin: `update profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');` (create that user under Authentication → Users first, with a password).

### 2. Astro service (Fly.io, Render or Railway; free or about $5/month)
```sh
cd astro && docker build -t soul-sync-astro . && docker run -e ASTRO_API_KEY=<same random> -p 8080:8080 soul-sync-astro
```
Deploy the same Dockerfile to your host and set `ASTRO_API_KEY`. Use the public URL as `ASTRO_URL` above.

### 3. App
```sh
cd app
cp .env.example .env            # fill in the Supabase URL + anon key
npm install
npx eas init                    # writes your EAS projectId; paste it into app.json → extra.eas.projectId
npx eas build --profile development --platform ios   # a dev build; Expo Go can't load HealthKit
npx expo start
```
HealthKit and Health Connect only work in a development or production build on a physical device, not in Expo Go or most simulators.

### 4. Pilot builds (TestFlight + Play internal testing)
```sh
npx eas build --profile pilot --platform all
npx eas submit --profile pilot --platform ios       # → TestFlight
npx eas submit --profile pilot --platform android   # → Play "internal" track
```
You need an Apple Developer account ($99/yr) and a Google Play developer account ($25 once). Before external TestFlight testers can install, Apple runs a Beta App Review, which needs a privacy policy URL. Google requires a Health Connect permissions declaration in Play Console for apps that request health permissions; budget a few days for it.

### 5. Admin dashboard
`cp admin/config.example.js admin/config.js`, fill it in, and host `admin/` on any static host (Netlify, Vercel, GitHub Pages). Sign in with your admin user.

## Tests
```sh
cd shared && npm test                       # core logic (Node 22+)
bash scripts/test-db.sh                     # migration + RLS + metrics on a throwaway Postgres 15+
cd astro && pip install -r requirements.txt pytest httpx && pytest
cd app && npx tsc --noEmit
bash scripts/sync-shared.sh                 # after editing shared/*.ts (a test fails if you forget)
```

## Costs at pilot scale (50 users)
- Supabase: free tier works. Pro ($25/mo) adds daily backups and avoids free-tier pausing, which is worth it once real people's data is in there.
- LLM: default `claude-opus-5-5` at low effort is a few cents per card, so roughly $30–60/month for 50 daily users. Switching the model to `claude-haiku-5-5` in the dashboard cuts that by more than 10× if quality holds.
- Astro service: $0–7/month. Apple $99/yr, Google $25 once.

## Things to decide before the pilot
- **Swiss Ephemeris licence.** It is dual-licensed AGPL or commercial. Running it as a network service for a closed-source product needs the commercial licence (from Astrodienst) or open-sourcing `astro/`. Decide before launch, not after.
- **What the pilot can prove.** With 20–50 self-selected users, no control group, and people who often join on a low week, WHO-5 will likely rise whatever the app does (regression to the mean). Present it to investors as feasibility and engagement data. For an efficacy *signal*, randomise half the pilot to cards without the timing layer: that is the question investors will actually ask.
- **WHO-5 cadence.** The index asks about "the last two weeks", so weekly answers overlap. Weekly is implemented per the brief (`WHO5_RECHECK_DAYS`); 14 days is the cleaner choice.
- **HRV.** Apple gives SDNN, Health Connect gives RMSSD. They aren't comparable across users; the app only compares each person with their own baseline and labels the method.
- **Crisis screen.** A keyword screen is a floor, not a safety system. It's deliberately over-inclusive, but it will miss oblique language. Don't market the app as monitoring anyone's safety.
- **App Store.** Apple's guideline 4.3 is strict on astrology apps. Lead the store listing with the wellness and habit design, not horoscopes.
- **Design.** The demo-screen link in the brief was a placeholder, so the visual layer follows HIG/Material defaults with a warm neutral palette (`app/src/lib/theme.ts`). Map it to your designed screens before the pilot.
- **Widget** (stretch goal) isn't built yet. `expo-widgets` / an iOS widget extension can read today's card from the same `cards` row.
