# CLAUDE.md — Kinara HR

HRMS for Konkan Coastal Foods (Goa): Employee Master, Attendance, Leave, "Ask HR" agent.
Stack: Next.js 15 App Router + TypeScript, Postgres (Supabase) via `postgres`, Clerk (identity only), SMTP email, Gemini via Vercel AI SDK.

Rules:
- **All times in IST.** Use `src/lib/ist.ts` (`todayIST`, `istDate`, `fmtTime`…). Never `new Date().toLocaleDateString()` or local-zone getters. DB dates are `'YYYY-MM-DD'` strings.
- **Never commit secrets** (`.env.local`, keys). Only `.env.example` with blank values.
- **Follow DESIGN.md** (status colours, components in `globals.css`). Follow ARCHITECTURE.md; change it + the decision log before departing from it.
- Business rules live in `src/lib/rules/` (pure, unit-tested) and are described in RESEARCH.md → "Leave policy implemented". Services in `src/lib/services/` take the `Actor` and re-check roles — never rely on hiding UI.
- Roles come from the DB: `is_hr_admin`; manager = has active direct reports. Not from Clerk.
- PAN/Aadhaar/bank are masked on the server; Aadhaar is never shown in full; agent tools never select them.
- Agent: only `draft_leave_request` writes (a draft); log every tool call to `agent_log`; max 5 per question.
- Folders: `rules/` `services/` `agent/` `app/(app)/<screen>` `app/actions/<module>.ts` `tests/{rules,integration,agent}`.
- Run `npm test` (uses the `_test` database) and `npx tsc --noEmit` before committing. Never run `db:reset` on a remote DB without asking.
