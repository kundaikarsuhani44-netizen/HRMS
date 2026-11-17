# RESEARCH — how Indian companies run employee records, attendance and leave

> Draft prepared with Claude Code. **Before submission: rewrite the answers in your own words, verify each figure against the linked source, and do Q8 (the interview) yourself.**

## 1. What does an Indian HR team keep for every employee?
- **Identity & contact:** full name, date of birth, gender, personal/work email, mobile, current & permanent address with PIN code and state, photo, emergency contact.
- **Job:** employee code, date of joining, designation, department, location, reporting manager, grade, employment type, probation/confirmation date, last working day and exit reason.
- **Statutory:** **PAN** (mandatory for TDS on salary, Income-tax Act s.139A/206AA), **Aadhaar** (used for e-KYC/UAN seeding; collection should be minimal under the Aadhaar Act and DPDP Act 2023), **UAN** (EPF, for those covered by the EPF Act; a new joiner may not have one yet), ESIC number where applicable.
- **Bank:** account number, IFSC, bank name — needed for salary credit.
- **Sensitive:** Aadhaar, PAN, bank details, DOB, health/medical certificates, family details. Under the **Digital Personal Data Protection Act, 2023** these are personal data: collect for a stated purpose, restrict access, keep secure. Aadhaar must be stored/displayed masked (UIDAI guidance: only last 4 digits visible).

## 2. Employee code
Usually a company prefix + running number (e.g. `KCF0001`), sometimes with a location/year segment. It must **never change** because it is the key the payroll vendor, PF/ESI returns, access cards, emails and every historical record use; names and emails change (marriage, typos), codes do not. Codes of exited employees are not reused, otherwise old payslips and audit history point to the wrong person.

## 3. Leave types; statutory vs policy
Typical: **CL** (casual, short notice), **SL** (sickness, may need a certificate), **EL/PL** (earned/privilege, accrues with service, can carry forward and sometimes be encashed), **Maternity** (statutory: 26 weeks under the Maternity Benefit Act 1961, amended 2017, for the first two children; 12 weeks thereafter), **Paternity** (not statutory in the private sector — company policy; central govt employees get 15 days), **LOP** (unpaid), **Comp-off** (for working on an off-day).
*Statutory entitlement* = minimum the law guarantees (e.g. maternity, state Shops & Establishments Act leave). *Company policy* = what the employer chooses to give on top (e.g. paternity 5 days, CL 8 days) — it can be more generous, never less than the law.

## 4. Accrual and year end
Three common patterns: **credited upfront on 1 Jan** (CL/SL), **monthly accrual** (EL, e.g. 1.25/month = 15/year), and **pro-rated for mid-year joiners**. Unused leave at year end either **lapses** (CL/SL usually), is **carried forward** up to a cap (EL, e.g. 30–45 days), or is **encashed** (EL, often at exit). Our implementation: see the policy rules below.

## 5. Goa Shops and Establishments Act
The **Goa Shops and Establishments (Regulation of Employment and Conditions of Service) Act, 2023** (replaced the 1973 Act) — verify sections in the source:
- Working hours: not more than 9 hours a day / 48 hours a week; rest interval after 5 hours.
- At least one paid weekly holiday (weekly off).
- Paid leave entitlements (earned leave accruing with days worked, casual/sick leave) and national/festival holidays.
Konkan's policy (8 CL, 7 SL, 15 EL, 1 weekly off at plant, 2 at HO) is designed to meet or exceed these minimums.

## 6. National vs restricted (optional) vs state holiday
- **National holidays:** Republic Day (26 Jan), Independence Day (15 Aug), Gandhi Jayanti (2 Oct) — mandatory paid holidays everywhere.
- **State holidays:** declared by the state government (Goa: Goa Liberation Day 19 Dec, Feast of St Francis Xavier 3 Dec, Ganesh Chaturthi…) — apply to establishments in that state; can differ between a head office and a plant.
- **Restricted/optional holidays:** a list from which an employee may pick a fixed number; it is a working day unless the employee chooses it. In Kinara, Optional holidays are working days; the employee applies CL/EL.

## 7. Late arrivals, half days, WFH, missed punches
Common practice: a grace time (here 10:15 AM); repeated lates convert to leave/LOP (here every 3rd Late = ½ day LOP); minimum hours for a half day (4) and full day (8); WFH is approved/marked and counts as present; a missed punch shows Absent until the employee raises a **regularisation** request that the manager approves.

## 8. Interview — *to be done by the student*
Interview one working professional about the HR system they use (Keka / Darwinbox / greytHR / SAP…). Record: what they like, what they dislike (e.g. "regularisation takes 3 clicks too many", "balance shown doesn't include pending").

## Sandwich rule (explained)
A **sandwich rule** counts weekly offs/holidays that fall *between* two leave days as leave too (e.g. leave Fri + Mon = 4 days including Sat–Sun). **Konkan has no sandwich rule:** Fri→Mon at Panaji = 2 days.

## Leave policy implemented (rules)
1. Leave year = 1 Jan–31 Dec; a request must stay within one year.
2. CL 8/yr, credited 1 Jan; joiners pro-rated = 8 × months/12 (joining month counts if joined on/before the 15th), rounded to nearest 0.5; half day allowed; lapses 31 Dec.
3. SL 7/yr, same accrual as CL; half day allowed; lapses; **more than 2 consecutive working days needs a medical certificate**.
4. EL 1.25 per completed month of service in the year (max 15); full days only; carry forward max 30.
5. Maternity 26 weeks (182 calendar days), women, on request; Paternity 5 days, men, on request; LOP unlimited, half day allowed.
6. Leave days are working days of the employee's location: Panaji off Sat+Sun, Verna off Sun; National/State holidays of that location excluded; no sandwich rule.
7. Available = opening (carried forward) + accrued − approved; pending is shown separately and cannot be double-booked.
8. Request > balance → app offers to convert the excess to LOP.
9. Balance changes only on approval; cancel pending or not-yet-started approved leave restores it; no one approves their own leave.
10. Leave cannot be applied more than 30 days in the past.
11. Attendance: ≥8h Present, 4–8h Half Day, <4h/no punch Absent; check-in after 10:15 IST = Late; 3 Lates/month = ½ day LOP; approved leave overrides punches.

## Sources
- Maternity Benefit (Amendment) Act, 2017 — https://labour.gov.in/whatsnew/maternity-benefit-amendment-act2017
- Goa Shops and Establishments Act, 2023 — https://goalabour.gov.in (Acts & Rules)
- Digital Personal Data Protection Act, 2023 — https://www.meity.gov.in/data-protection-framework
- UIDAI — Aadhaar masking — https://uidai.gov.in
- EPFO — UAN — https://www.epfindia.gov.in
- Income-tax PAN format — https://www.incometax.gov.in
- RBI IFSC format — https://www.rbi.org.in
- Google AI Studio free-tier limits — https://ai.google.dev/gemini-api/docs/rate-limits
