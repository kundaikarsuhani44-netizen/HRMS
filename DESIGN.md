# DESIGN — Kinara HR

## 1. User flows

**Add employee**
```
HR → Employees → + Add → [Personal]→[Job]→[Statutory]→[Bank]→[Emergency] → Create
   → server validates every Indian field ──fail──► steps with ⚠, message under each field
   → ok → code KCF#### from DB sequence → profile page "Created KCF0021"
```
**Check-in → day status**
```
Home → [Check in] → attendance row (UNIQUE emp+date; 2nd click = same row) → after 10:15 IST? → Late
     → [Check out] → hours = out − in
computeDay(): not employed? → approved leave? (On Leave) → National/State holiday? → weekly off?
            → future? → WFH? (Present) → no punch? (Absent / "Not checked in" today)
            → no check-out on a past day? (Absent, missed punch) → ≥8h Present | 4–8h Half Day | <4h Absent
month: every 3rd Late → +½ day LOP
```
**Apply leave → approval → balance**
```
Apply form → live preview (same server function): working days, excluded dates, balance
  → insufficient? → offer "convert excess to LOP" → SL > 2 days? → certificate required
  → Submit → status pending → email manager      (balance unchanged; "pending" shown)
Manager inbox → sees balance + clashes → Approve (comment optional) / Reject (comment required)
  → approve re-checks balance → status approved → "used" increases → email employee
Employee → cancel (pending, or approved & not started) → status cancelled → balance restored
```
**Missed punch → regularisation**
```
My attendance shows Absent / Missed punch → Request regularisation (date ≤30 days back, times, reason)
 → pending (attendance untouched) → manager Approvals → Approve → attendance row upserted, source=regularised,
   Late recomputed, audit row → day status recalculated │ Reject → nothing changes
```

## 2. Wireframes (low fidelity)

**Home (desktop)** — check-in and balance visible with no clicks
```
┌sidebar┐┌───────────────────────────────────────────────────────┐
│Kinara ││ Namaste, Priya                         [+ Apply leave] │
│Home   ││┌──────────── 10:42:07 AM ─────┐┌── This month ────────┐│
│Attend.│││ Tue 17 Nov · IST   [Present] ││ Present 11  Late 1   ││
│Leave  │││ [ Check in ] [Work from home]││ Leave 1     LOP 0    ││
│Ask HR │││ In —   Out —                 │└──────────────────────┘│
│Team…  ││└──────────────────────────────┘                        │
│       ││ Leave balance: [CL 6.5][SL 6][EL 14][…]                │
│       ││ (managers) Team today: Present 4 · Leave 1 · Pending 2 │
│       ││ My recent requests table                               │
└───────┘└───────────────────────────────────────────────────────┘
```
**Home (phone)**
```
┌───────────────────────┐
│ Kinara HR      PF  ⎋  │
│ 10:42:07 AM  [Present]│
│ ┌───────────────────┐ │
│ │    CHECK IN       │ │  ← full-width 52px button
│ └───────────────────┘ │
│ [Work from home]      │
│ CL 6.5 │ SL 6         │
│ EL 14  │ LOP ∞        │
├───────────────────────┤
│ ⌂  ◷  ☀  ✦  ☺        │  ← bottom nav: Home, Attendance, Leave, Ask HR, Profile/Approvals
└───────────────────────┘
```
**Apply leave (phone)** — form, then summary below
```
Leave type [CL — can apply 6.5 ▾]
Duration  (Full day)(Half day)
From [20 Nov]  To [23 Nov]
Reason [__________]
┌ Summary ─────────────┐
│ Leave days 2         │
│ Not counted: Sat, Sun│
│ ⚠ Not enough → ☐ LOP │
└──────────────────────┘
[ Submit for approval ]
```
Other screens (all built): **My profile** (tabs Personal/Job/Statutory/Bank/Emergency + contact form) · **Employee directory** (search, dept/location/status filters, table) · **Add/Edit employee** (5-step form) · **My attendance** (month calendar, stats, regularisation + WFH forms) · **Team attendance** (Today table / Month grid letters P H A L Ho W) · **My leave** (balance cards with opening/accrued/used/pending/available, history with Cancel) · **Approvals** (leave cards with balance & clash badges; regularisation table) · **Leave calendar** (people × days grid, clashes outlined orange) · **Ask HR** (chat, tool chips under answers, dashed draft card with Confirm) · **Settings** (Holidays, Leave types, Locations & departments, Policy text, Email log with draft Send, Agent log) · **Reports** (month table + CSV).

## 3. Design system

- **Name & logo:** *Kinara HR* ("kinara" = shore). Mark: orange sun setting over two teal waves (`components/Logo.tsx`, `public/icon.svg`).
- **Colour:** brand teal `#0e5e6f` (7.0:1 on white), dark `#0a4654`, accent sunset `#e07a1f` (counts, clashes), ink `#17202a` (15.9:1), secondary `#4a5662` (7.4:1), hint `#6b7783` (4.6:1). Danger `#b42318`, success `#1d7a46`, warning `#9a5b00`. All text pairs meet WCAG AA.
- **Typography:** system UI stack (Inter if installed), 15 px body, 22/17/15 px headings, tabular numerals for all numbers.
- **Spacing:** 4-px scale (4, 8, 12, 16, 24, 32). Radius 10 px cards, 6 px controls.
- **Components (`globals.css` + `src/components`):** Button (primary / secondary / ghost / danger / ok; sm / lg), Card, Stat tile, Balance card, Table (`.t`), Field with label, required star, help text and **error state** (red border + message, step ⚠ on the multi-step form), Status badge, Tabs, Calendar, Alert (error/ok/warn/info), Empty state, Skeleton.

## 4. Status colours (identical everywhere: badges, calendar, team grid, legend)

| Status | Text | Background |
|---|---|---|
| Present | `#1d7a46` | `#dcf2e4` |
| Half Day | `#9a5b00` | `#ffeccc` |
| Absent | `#b42318` | `#fbe1de` |
| On Leave | `#2457a6` | `#e0eafa` |
| Holiday | `#6b3fa0` | `#eee5f8` |
| Weekly Off | `#56606b` | `#eceff2` |
| Late | `#c2410c` | `#ffe8d9` |
| WFH (modifier) | `#0e5e6f` | `#dff0f2` |

Colour is never the only signal: every cell/badge also carries a word or letter.

## 5. Empty, loading and error states

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Dashboard | skeleton blocks (`(app)/loading.tsx`) | "No leave requests yet → Apply"; "No active direct reports" | `(app)/error.tsx` card with Try again / Go home; check-in errors shown inline on the card |
| Approvals inbox | skeleton | "✅ All caught up — no leave waiting for you" | action errors shown above the buttons (e.g. "Cannot approve: CL available is 1") |
| Reports | skeleton | "No employees in scope for this month" | CSV route returns 401/403 JSON; page shows Denied card |
| Any denied URL | — | — | 🔒 "Access denied" card, server-rendered, no data loaded |
