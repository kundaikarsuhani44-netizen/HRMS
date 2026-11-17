# Kinara HR

HRMS for **Konkan Coastal Foods** — Employee Master, Attendance, Leave and the **Ask HR** AI assistant.
Docs: [RESEARCH.md](RESEARCH.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DESIGN.md](DESIGN.md) · [CLAUDE.md](CLAUDE.md)

**Live URL:** _add after deploying to Vercel_

## Setup (local)
```bash
npm install
cp .env.example .env.local      # fill in values
npm run db:migrate
npm run db:seed                 # 2 locations, 4 departments, 20 employees, holidays, balances, attendance
npm run dev                     # http://localhost:3000
```
Quick local demo without Clerk: set `AUTH_MODE=demo` and `DEMO_SESSION_SECRET=<any 32 chars>` in `.env.local`, then pick a user on `/sign-in`.

## Deploy (free tiers)
1. **Supabase** → new project → copy the *Transaction pooler* connection string (port 6543) into `DATABASE_URL`; run `npm run db:migrate && npm run db:seed` from your laptop with that URL.
2. **Clerk** → new app (email sign-in) → keys into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Seed with `SEED_EMAIL_BASE=you@gmail.com` so every employee gets `you+name@gmail.com` and you can sign in as each role.
3. **Email** → Brevo free SMTP (or Gmail app password) → `SMTP_*`, `EMAIL_FROM`. Without SMTP, emails are logged in Settings → Email.
4. **Gemini** → Google AI Studio API key → `GOOGLE_GENERATIVE_AI_API_KEY`.
5. **Vercel** → import the GitHub repo → add all env vars (`AUTH_MODE=clerk`, `APP_URL=https://<your>.vercel.app`) → deploy.

## Test logins (seed data)
**Passwords** (`AUTH_MODE=password`): HR Admin tab uses `HR_PASSWORD`; Manager and Employee tabs use `EMPLOYEE_PASSWORD`. Both are set as environment variables (`.env.local` / Vercel), never in the repo. Sign in with the employee code or email.

| Role | Name | Code | Email (default seed) |
|---|---|---|---|
| HR Admin | Ananya Prabhu | KCF0002 | ananya.prabhu@konkanfoods.example |
| Manager (plant, top) | Rajesh Naik | KCF0001 | rajesh.naik@konkanfoods.example |
| Manager (sales, Panaji) | Sneha Kamat | KCF0003 | sneha.kamat@konkanfoods.example |
| Manager (QA, Verna) | Vikram Desai | KCF0004 | vikram.desai@konkanfoods.example |
| Employee (Panaji) | Aditya Dessai | KCF0012 | aditya.dessai@konkanfoods.example |
| Employee (Verna, 3 Lates) | Santosh Parab | KCF0006 | santosh.parab@konkanfoods.example |
| Joined 1 July (pro-rated) | Nilesh Sawant | KCF0009 | nilesh.sawant@konkanfoods.example |
| Exited 31 Oct (blocked) | Kunal Bandodkar | KCF0016 | kunal.bandodkar@konkanfoods.example |

With Clerk, sign up using the employee's email (or the `+name` address if you seeded with `SEED_EMAIL_BASE`).

## Tests
```bash
npm test             # 34 tests: rules + the testing checklist against a fresh "<db>_test" database
npm run agent:eval   # 17 agent prompts (attacks + Hinglish) against the real model
```
