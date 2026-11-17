# ARCHITECTURE — Kinara HR

HRMS for Konkan Coastal Foods (180 people, Panaji head office + Verna plant, Goa).
Modules: Employee Master, Attendance, Leave, and the "Ask HR" assistant agent.

## 1. Stack

| Layer | Choice | Why | Rejected alternative |
|---|---|---|---|
| Framework | **Next.js 15 (App Router), TypeScript** | Server components + server actions mean every read and write runs on the server, where role checks live. One codebase for UI and API. | Separate React SPA + Express API: two deploys, and role checks get duplicated in the browser. |
| Hosting | **Vercel (Hobby, free)** | Native Next.js host, env vars per environment, free. | Render free tier: cold starts of ~50 s kill the check-in demo. |
| Database | **Supabase Postgres (free)** | Real Postgres: CHECK / UNIQUE / EXCLUDE constraints, triggers, row-level security. | Firebase: no relational constraints, so “one attendance row per day” and “no overlapping leave” would be app-only. |
| DB access | `postgres` (postgres.js) over the transaction pooler, from server code only | Plain SQL is easy to read in the viva; no ORM magic. | Supabase JS client from the browser: would put access control in RLS policies alone and expose the API to the browser. |
| Auth | **Clerk (free)** — identity only | Handles sign-in, email verification, sessions. **Roles are not stored in Clerk.** | Supabase Auth: fine, but Clerk was the course default and its prebuilt UI saves a day. |
| Email | **SMTP via nodemailer** — Brevo free tier (300/day) or Gmail app password | Works with any free SMTP; every email is also written to `email_log`. | Resend: free tier needs a verified domain. |
| AI | **Google Gemini 2.5 Flash** via **Vercel AI SDK v5** (`ai`, `@ai-sdk/google`) | Free tier (Google AI Studio; limits change — check the AI Studio rate-limit page before the demo), reliable tool calling, handles Hinglish. | Groq + Llama: fast, but tool-call JSON was less reliable on Hinglish prompts in testing. |

`AUTH_MODE=demo` is an extra, *development/demo-only* sign-in that lets you pick a seeded employee (no password). It is refused in production unless `ALLOW_DEMO_AUTH=true` is also set, and it still loads the role from the database.

## 2. System diagram

```
 Browser (phone / laptop)
   │  HTTPS (Clerk session cookie)
   ▼
 Vercel — Next.js server ───────────────► Clerk API  (who is this? verified email)
   │  ①  src/lib/auth.ts  getSession(): email → employees row → Actor{is_hr_admin, is_manager}
   │  ②  page / server action / API route: requireActor(), then role check (Denied / AccessDenied)
   │  ③  src/lib/services/*: every function takes the Actor and checks again (requireHr, canApproveFor…)
   │  ④  Postgres constraints + triggers: last line of defence
   ├────────────────────────────────────► Supabase Postgres (RLS on; API roles see nothing)
   ├────────────────────────────────────► SMTP (Brevo/Gmail) — leave request / decision emails
   └── /api/agent ── askAgent(actor) ────► Gemini API  (gets: question, chat text, tool schemas,
                         ▲                              tool RESULTS — never PAN/Aadhaar/bank)
                         └ tools run on the server as the Actor → same services as ③
```
Role checks happen at ①②③ (server), never only by hiding a button. The browser holds no DB credentials or API keys.

## 3. Data model

```
locations 1─* employees *─1 departments
employees 1─* employees            (reporting_manager_id, self-FK, no cycles)
employees 1─1 employee_statutory   (pan, aadhaar, uan)        RLS forced
employees 1─1 employee_bank        (account_number, ifsc)     RLS forced
locations 1─* holidays
employees 1─* attendance           UNIQUE(employee_id, date)
employees 1─* regularisation_requests ─? attendance
leave_types 1─* leave_requests *─1 employees ; leave_requests 1─? leave_attachments
leave_types 1─* leave_balances *─1 employees   PK(employee_id, leave_type_id, year)
policy_documents ; audit_log ; email_log ; agent_log *─1 employees
```

Full DDL: `db/migrations/001_schema.sql`. Key constraints:

| Table | Constraint | Rule it enforces |
|---|---|---|
| employees | `employee_code` default `'KCF'‖lpad(nextval(seq),4,'0')`, UNIQUE, trigger forbids change | E1: auto, unique, permanent code |
| employees | CHECK mobile `^[6-9][0-9]{9}$`, pincode 6 digits, `dob <= doj − 18y` | Indian fields, 18+ on joining |
| employees | CHECK `reporting_manager_id <> id` + trigger `forbid_reporting_cycle` (recursive CTE) | E4: no A→B→A |
| employees | unique `lower(email)` | one employee per sign-in |
| employee_statutory | CHECK PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`, Aadhaar 12 digits, UAN 12 digits nullable; UNIQUE pan, aadhaar | |
| employee_bank | CHECK IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`, account 9–18 digits | |
| holidays | CHECK type in National/State/Optional; UNIQUE(location_id, date) | A7 per location |
| attendance | **UNIQUE(employee_id, date)**; check_out > check_in | A1: one record per day (answers “what stops two rows?”) |
| regularisation_requests | partial UNIQUE(employee_id, date) where pending | |
| leave_requests | CHECK half-day ⇒ single date; same year; `lop_days <= days`; **EXCLUDE gist (employee, daterange) where pending/approved** | no double-booking |
| leave_balances | PK(employee, type, year); stores only `opening` (carry-forward) and HR `adjustment` | see below |

**Changes from the suggested model (justified):**
- `leave_balances` stores **no** `accrued`/`used`/`available`. Available = opening + accrued(today) + adjustment − Σapproved. Accrued is a pure function of joining date and today; used/pending are sums over `leave_requests`. A stored balance goes stale on every approve/cancel/edit-of-joining-date and two writers can race; a calculated one cannot drift.
- `leave_types` gained `monthly_rate`, `certificate_after_days`, `counts_calendar_days` (maternity is in weeks), `eligible_gender`, `is_paid` — so policy is data, not `if (code === 'SL')`.
- `leave_requests.lop_days` records the part converted to LOP; `status` includes `draft` (agent drafts).
- `leave_attachments` (bytea, ≤2 MB, pdf/jpg/png) instead of `attachment_url` — no paid storage, and access goes through the same role check.
- Address and emergency contact are columns on `employees` (self-service fields).
- Added `policy_documents` (text the agent answers from), `email_log`, `agent_log`, `audit_log.reason`.
- **Why statutory/bank are separate tables:** so they can have their own, stricter RLS (forced, no grants) and so no ordinary `select * from employees` can ever carry PAN/Aadhaar/bank into a page or the agent.

## 4. Access control

1. **Sign-in → employee:** Clerk session → user's *verified primary email* → `employees.email` (case-insensitive). No match → `/access-denied`. `clerk_user_id` is stored on first sign-in for reference.
2. **Role:** `is_hr_admin` column. **Manager is derived**: `exists(active employee with reporting_manager_id = me)`. No separate manager accounts.
3. **Deactivated:** `last_working_day < today (IST)` → every page redirects to `/access-denied` (checked on every request, so it takes effect the next day automatically).
4. **Checks:** every page calls `requireActor()`; pages for HR/managers render `<Denied>` for others; every service function re-checks (`requireHr`, `requireManagerOrHr`, `canApproveFor` = direct manager or HR, **never self**). URL tampering (`/employees/2` as an employee, `/attendance?emp=…`, CSV API) is refused on the server.
5. **RLS (`002_rls.sql`):** RLS enabled on every table; `employee_statutory` and `employee_bank` use FORCE RLS with a policy only for the server's owner role; all grants revoked from Supabase `anon`/`authenticated`. The app never uses the Supabase REST API, so even a leaked anon key reads nothing.
6. **Masking:** PAN `ABCDE****F`, Aadhaar `XXXX XXXX 1234`, account last 4 — applied on the server before data leaves (`rules/masking.ts`). HR **Reveal** exists for PAN and account only, writes `REVEAL:*` to `audit_log`. Aadhaar has no reveal at all. Audit rows store masked statutory values.

## 5. Business logic location

All rules are **server-side TypeScript pure functions** in `src/lib/rules/` (unit-tested without a DB), called by services in `src/lib/services/`. The database adds constraints that guard invariants even if code is wrong.

| Rule | Where |
|---|---|
| Working-day count, weekly offs, holidays, no sandwich | `rules/calendar.ts` `countLeaveDays`, `dayKind` |
| Day status (Present/Half/Absent/Leave/Holiday/Off), precedence | `rules/dayStatus.ts` `computeDay` — **the single function** used by calendar, team view, CSV and agent |
| Late after 10:15, every 3rd Late = ½ LOP | `rules/dayStatus.ts` `isLateCheckIn`, `applyLateRule` |
| Accrual, pro-rating, EL monthly, carry forward, LOP split | `rules/accrual.ts` |
| Spreading approved leave over dates (paid first, then LOP) | `rules/allocation.ts` |
| Indian field validation | `rules/validation.ts` + DB CHECKs |

Why not database functions: rules are easier to test, read and explain in TypeScript; the DB keeps the invariants that must hold under concurrency (unique day, no overlap, no cycle).

## 6. AI agent

- **Model:** `gemini-2.5-flash` (env `AGENT_MODEL`), Vercel AI SDK `generateText` with `stopWhen: stepCountIs(6)`, temperature 0.2. Non-streaming JSON reply.
- **Tools** (`src/lib/agent/tools.ts`), all run on the server as the signed-in Actor:

| Tool | Input | Output | Who |
|---|---|---|---|
| get_my_leave_balance | year? | opening/accrued/used/pending/available per type | everyone |
| get_holidays | year, month | holidays at *own* location | everyone |
| count_working_days | from, to, half_day? | leave_days, counted dates, excluded with reasons | everyone |
| explain_policy | topic | stored policy text (`policy_documents`) | everyone |
| draft_leave_request | type, from, to, half?, reason, convert_excess_to_lop? | draft id + preview (status `draft`) | everyone (write, confirmed) |
| get_team_today | — | present/leave/absent names | managers (direct reports), HR |
| summarise_pending_approvals | — | pending requests + balance + clashes | managers, HR |
| **month_end_check** (own tool) | year, month, draft_reminder? | team members with ≥3 Late or missed punches, LOP; saves *draft* reminder emails for HR to send | managers, HR |

- **Model can see:** the question, prior chat *text*, tool schemas, tool results (names, dates, counts). **Never:** PAN, Aadhaar, UAN, bank — no tool selects those columns. No DB credentials or service key: tools are closures over the Actor.
- **Writes:** only `draft_leave_request`, which inserts `status='draft'`. The chat shows a card; the user's **Confirm** button calls `confirmDraft` (server action), which re-runs every rule. No tool can approve, reject or cancel.
- **Numbers from code:** system prompt rule + a server-side check that replaces an answer stating leave numbers when no tool was called.
- **Limits & logging:** max 5 tool calls per question (6th returns an error); every call — including refusals and bad input — goes to `agent_log` (user, tool, inputs, result, ok, time). Visible in Settings → Agent log.
- **Tests:** `tests/agent/prompts.json` (17 prompts incl. attacks and Hinglish), run by `npm run agent:eval`; tool guardrails are also covered by `tests/integration`.

## 7. Folder structure

```
db/migrations/        001_schema.sql, 002_rls.sql
scripts/              migrate.ts, seed.ts, agent-eval.ts
src/lib/ist.ts        all date/time helpers (IST)
src/lib/rules/        pure business rules (no DB)
src/lib/services/     employees, attendance, leave, reports, settings, calendar, audit, email, actor
src/lib/agent/        tools.ts (tool layer + system prompt), run.ts (model call)
src/lib/auth.ts       session → Actor
src/app/(app)/        pages: / attendance team leave leave/apply approvals leave-calendar
                      employees profile reports settings assistant
src/app/actions/      server actions per module
src/app/api/          agent, reports/month-end (CSV), leave/[id]/attachment
src/components/       design-system components
tests/rules           unit tests ; tests/integration  checklist on a test DB ; tests/agent prompts
```

## 8. Dates and time zone

- Calendar dates are Postgres `date` and are returned to JS as `'YYYY-MM-DD'` **strings** (custom type parser in `db.ts`) — never JS `Date`, which would shift by the server zone.
- Instants are `timestamptz`; the DB session runs with `TimeZone=Asia/Kolkata`.
- "Today" is `todayIST()` = UTC + 5:30 arithmetic; nothing reads the machine's local zone. Late = minutes-after-IST-midnight > 615.
- Display uses `Intl.DateTimeFormat(..., { timeZone: 'Asia/Kolkata' })`; the check-in clock is IST on any device.
- Tested by unit tests (UTC instants that are a different IST date) and by running with `TZ=America/New_York`.

## 9. Risks

| Risk | Mitigation / test |
|---|---|
| Balance or working-day count wrong (pro-rating, EL, location calendars) | Pure functions with unit tests for the checklist cases (1 July joiner, Fri–Mon 2 vs 3, LOP split); balance never stored. |
| A role check bypassed via URL or direct API/action call | Checks in services, not just pages; integration tests call services as the wrong user; smoke test of URL tampering. |
| Agent leaks data or acts without consent | Tools cannot read sensitive columns; only a draft write; 5-call cap; `agent_log`; 17 attack/Hinglish prompts in `npm run agent:eval`. |

Also: free-tier Gemini quota exhaustion during the demo → friendly message; every screen works without the agent.

## 10. Decision log

| Date | Decision |
|---|---|
| 2026-11-17 | Balance calculated, not stored (only opening + adjustment stored). |
| 2026-11-17 | Medical certificates stored in Postgres bytea (≤2 MB) instead of Supabase Storage URL. |
| 2026-11-17 | Optional holidays are working days (employee applies CL/EL); only National/State are days off. |
| 2026-11-17 | Half Day = 0.5 present + 0.5 LOP in the month-end CSV. |
| 2026-11-17 | Added `AUTH_MODE=demo` for local testing and the class demo; production uses Clerk. |
| 2026-11-17 | Extra agent tool: `month_end_check` (Late/missed-punch flags + draft reminder emails HR must send). |
