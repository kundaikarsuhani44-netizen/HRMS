/**
 * The stored policy text. Seeded into policy_documents; HR can edit it in Settings.
 * The HR assistant's explain_policy tool answers ONLY from what is stored in the database.
 */
export const LEAVE_POLICY = `KONKAN COASTAL FOODS — LEAVE POLICY (effective 1 January 2026)

1. Leave year. The leave year runs from 1 January to 31 December. A single leave request must fall inside one leave year.

2. Leave types and entitlement.
   - Casual Leave (CL): 8 days a year, credited on 1 January. Employees who join during the year get a pro-rated share. Half days allowed. Unused CL lapses on 31 December.
   - Sick Leave (SL): 7 days a year, credited on 1 January, pro-rated for joiners. Half days allowed. Unused SL lapses on 31 December. Sick Leave of more than 2 consecutive working days requires a medical certificate to be uploaded with the request.
   - Earned Leave (EL): 15 days a year, earned at 1.25 days for every completed month of service in the year. Full days only. Unused EL is carried forward to the next year up to a maximum of 30 days; any balance above 30 lapses.
   - Maternity Leave (ML): 26 weeks (182 calendar days) as per the Maternity Benefit Act, 1961 (as amended in 2017), for women employees, for the first two children. Available on request. Counted in calendar days because the Act grants it in weeks. Full days only.
   - Paternity Leave (PL): 5 working days (company policy, not a statutory entitlement), for male employees, available on request. Full days only.
   - Loss of Pay (LOP): unlimited, unpaid. Half days allowed.

3. Pro-rating for joiners. CL and SL are credited for the months remaining in the year, counting the joining month if the employee joined on or before the 15th. The result is rounded to the nearest half day. Example: joining on 1 July gives 6 months, so CL = 8 × 6/12 = 4 days and SL = 7 × 6/12 = 3.5 days.

4. Counting leave days. Leave is counted in working days only. Weekly offs and holidays that fall inside a leave period are never counted as leave. Konkan Coastal Foods does NOT follow a sandwich rule. Example: at the Panaji head office, leave from Friday to Monday counts as 2 days (Friday and Monday), because Saturday and Sunday are weekly offs. At the Verna plant the same leave counts as 3 days, because Saturday is a working day at the plant.

5. Weekly offs. Panaji head office: Saturday and Sunday. Verna plant: Sunday only.

6. Insufficient balance. An employee cannot take leave beyond the available balance. When a request is larger than the balance, the system offers to convert the excess days into Loss of Pay.

7. Approval. Leave is approved or rejected by the employee's reporting manager, with a comment. The balance is reduced only when a request is approved; pending requests do not change the balance but cannot be double-booked. No one can approve their own leave.

8. Cancellation. An employee may cancel a pending request, or an approved request that has not yet started. The balance is restored automatically.

9. Back-dated leave. Leave cannot be applied for dates more than 30 days in the past.

10. Holidays. Holidays are set per location. National and State holidays are paid days off. Optional (restricted) holidays are working days; an employee who wishes to observe one applies for CL or EL.`;

export const ATTENDANCE_POLICY = `KONKAN COASTAL FOODS — ATTENDANCE POLICY (effective 1 January 2026)

1. Time zone. All attendance times are recorded and shown in Indian Standard Time (IST, Asia/Kolkata).

2. Check in and check out. Employees check in when they start work and check out when they leave, once each per day. There is one attendance record per employee per day.

3. Day status.
   - Worked 8 hours or more: Present.
   - Worked 4 hours or more but less than 8 hours: Half Day (half a day is treated as Loss of Pay).
   - Worked less than 4 hours, or no check-in on a working day: Absent (Loss of Pay).
   - A day with approved leave is On Leave, even if the employee also checked in.
   - Holidays and weekly offs of the employee's location are shown as Holiday and Weekly Off.

4. Late arrival. A check-in after 10:15 AM IST is marked Late. Every three Late marks in a calendar month convert into one half day of Loss of Pay (the 3rd, 6th, 9th… Late mark each add half a day of LOP).

5. Work from home. An employee may mark a day as Work From Home (WFH). A WFH day counts as Present. WFH can be marked for today or up to 30 days back.

6. Missed punch and regularisation. If an employee forgot to check in or check out, the day shows as Absent. The employee can raise a regularisation request with the correct times and a reason, up to 30 days back. Attendance changes only after the reporting manager approves. HR can also correct a record, and must record a reason.

7. Month-end. At the end of each month HR downloads a summary of days present, WFH days, leave by type, Loss of Pay days, holidays and weekly offs for the payroll vendor.`;
