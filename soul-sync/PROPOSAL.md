# Reply to the brief

The brief asks for approach, timeline, fixed price, and 1–2 shipped HealthKit / Health Connect apps. Here's an honest answer to each.

## Approach
Already built in this repo rather than proposed: see `README.md`. In short:
- **One small engine, three inputs.** The deterministic layer (pattern echoes, learning from "did it help?", crisis screen, WHO-5) is plain tested TypeScript shared by the app and the server. The LLM only *words* the card. That's how "you named this two Mondays ago" stays true instead of plausible.
- **Safety is in code, not in the prompt.** Crisis screening runs before any card is generated, and non-negotiable guardrails are appended after the admin-editable prompt, so tuning can't remove them.
- **Measure what the brief cares about.** Retention, check-in rate, completion, "it helped" (also per prompt version), WHO-5 change and session length are SQL, tested on real Postgres.
- **Low-cost stack:** Supabase free tier, a tiny Python service for Swiss Ephemeris, Expo/EAS for both stores.

## Timeline (from this codebase to 20–50 pilot users)
| Week | Work |
|---|---|
| 1 | Accounts (Apple, Google, Supabase, Anthropic, astro host), deploy backend, first dev builds on real iPhone and Android devices, validate HealthKit / Health Connect reads |
| 2 | Map the UI to your designed screens; tune the engine prompt on 10–20 real test profiles; privacy policy |
| 3 | TestFlight Beta App Review + Play internal track + Health Connect declaration; internal dogfood |
| 4 | Invite pilot users; weekly demos from here on |
| 5–6 (optional) | Home-screen widget, prompt iteration from "it helped" data, polish |

So **about 4 weeks to pilot-ready**, 6 with the widget. From scratch this would typically be 10–14 weeks.

## Price
I can't give you a binding fixed price. I'm not a contractor and can't sign a contract or carry delivery risk. What I can give you is a benchmark for comparing bids:
- **Finishing this repo** (the timeline above): roughly 120–200 hours of a senior React Native developer. At US freelance rates of $90–150/hr that's about **$12k–30k**; strong offshore teams commonly quote $40–70/hr.
- **Building it from zero**, as the brief is currently worded: commonly **$35k–70k+**.
- Running costs at pilot scale: about $30–100/month (see README), plus $99/yr Apple and $25 once for Google.

Use that as leverage: send bidders this repo and ask them to quote *finishing* it.

## Shipped HealthKit / Health Connect apps
None. I'm an AI assistant and have no portfolio of shipped store apps. Any contractor you hire should show you theirs; ask specifically about Health Connect, whose Play Console permission declaration trips up first-timers.

## Gaps in the brief worth filling before it goes out
- `[paste demo link]`, `[X weeks]` and `[$ range]` are still placeholders.
- State whether you'll buy the Swiss Ephemeris commercial licence or open-source the astro service (it's AGPL).
- Say what the pilot is meant to prove. "Investors see real change" needs a comparison group to mean much at n = 50 (see README → Things to decide).
