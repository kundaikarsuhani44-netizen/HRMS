-- Kinara HR — schema v1 (Konkan Coastal Foods)
-- Every date column is a calendar date in IST. Every timestamp is timestamptz and is
-- displayed in Asia/Kolkata. The app sets the session time zone to Asia/Kolkata.

create extension if not exists btree_gist;   -- for the "no overlapping leave" exclusion constraint

-- ------------------------------------------------------------------ reference data
create table locations (
  id             serial primary key,
  name           text not null unique,                      -- 'Panaji Head Office'
  short_name     text not null unique,                      -- 'Panaji'
  city           text not null,
  state          text not null,
  -- ISO weekday numbers (1 = Monday … 7 = Sunday) that are weekly offs
  weekly_off_days smallint[] not null,
  check (weekly_off_days <@ array[1,2,3,4,5,6,7]::smallint[])
);

create table departments (
  id    serial primary key,
  name  text not null unique
);

-- ------------------------------------------------------------------ employees
create sequence employee_code_seq start 1;

create table employees (
  id                    serial primary key,
  employee_code         text not null unique
                        default ('KCF' || lpad(nextval('employee_code_seq')::text, 4, '0')),
  clerk_user_id         text unique,
  full_name             text not null check (length(trim(full_name)) >= 2),
  email                 text not null,
  mobile                text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  dob                   date not null,
  gender                text not null check (gender in ('Female','Male','Other')),
  -- address (self-service)
  address_line          text,
  city                  text,
  state                 text,
  pincode               text check (pincode ~ '^[0-9]{6}$'),
  -- emergency contact (self-service)
  emergency_name        text,
  emergency_relation    text,
  emergency_phone       text check (emergency_phone ~ '^[6-9][0-9]{9}$'),
  -- job (HR only)
  date_of_joining       date not null,
  last_working_day      date,
  designation           text not null,
  department_id         int  not null references departments(id),
  location_id           int  not null references locations(id),
  reporting_manager_id  int  references employees(id),
  salary_grade          text,
  is_hr_admin           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (dob <= date_of_joining - interval '18 years'),        -- at least 18 on joining
  check (reporting_manager_id is null or reporting_manager_id <> id),
  check (last_working_day is null or last_working_day >= date_of_joining)
);
create unique index employees_email_lower_uq on employees (lower(email));
create index employees_manager_idx on employees (reporting_manager_id);

-- employee_code never changes once issued
create or replace function forbid_employee_code_change() returns trigger language plpgsql as $$
begin
  if new.employee_code <> old.employee_code then
    raise exception 'employee_code is permanent and cannot be changed';
  end if;
  return new;
end $$;
create trigger employees_code_immutable before update on employees
  for each row execute function forbid_employee_code_change();

-- an employee cannot report to themselves or to anyone in their own reporting line below them
create or replace function forbid_reporting_cycle() returns trigger language plpgsql as $$
declare cycle_found boolean;
begin
  if new.reporting_manager_id is null then return new; end if;
  with recursive chain(id, depth) as (
    select new.reporting_manager_id, 1
    union all
    select e.reporting_manager_id, c.depth + 1
      from employees e join chain c on e.id = c.id
     where e.reporting_manager_id is not null and c.depth < 100
  )
  select exists (select 1 from chain where id = new.id) into cycle_found;
  if cycle_found then
    raise exception 'reporting cycle: employee % would end up reporting to themselves', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger employees_no_cycle before insert or update of reporting_manager_id on employees
  for each row execute function forbid_reporting_cycle();

-- sensitive data lives in separate tables so RLS can lock them down independently
create table employee_statutory (
  employee_id  int primary key references employees(id),
  pan          text not null check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  aadhaar      text not null check (aadhaar ~ '^[0-9]{12}$'),
  uan          text check (uan ~ '^[0-9]{12}$'),                 -- optional for new joiners
  updated_at   timestamptz not null default now()
);
create unique index employee_statutory_pan_uq on employee_statutory (pan);
create unique index employee_statutory_aadhaar_uq on employee_statutory (aadhaar);

create table employee_bank (
  employee_id     int primary key references employees(id),
  account_number  text not null check (account_number ~ '^[0-9]{9,18}$'),
  ifsc            text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name       text not null,
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ holidays
create table holidays (
  id           serial primary key,
  location_id  int not null references locations(id),
  date         date not null,
  name         text not null,
  type         text not null check (type in ('National','State','Optional')),
  unique (location_id, date)
);

-- ------------------------------------------------------------------ attendance
create table attendance (
  id            serial primary key,
  employee_id   int not null references employees(id),
  date          date not null,                         -- IST calendar date
  check_in      timestamptz,
  check_out     timestamptz,
  is_wfh        boolean not null default false,
  is_late       boolean not null default false,        -- check-in after 10:15 IST, set by the app
  source        text not null default 'self' check (source in ('self','regularised','hr_correction','seed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, date),                          -- one record per employee per day
  check (check_out is null or check_in is not null),
  check (check_out is null or check_out > check_in)
);

create table regularisation_requests (
  id              serial primary key,
  employee_id     int not null references employees(id),
  date            date not null,
  attendance_id   int references attendance(id),
  requested_in    timestamptz not null,
  requested_out   timestamptz not null,
  reason          text not null check (length(trim(reason)) >= 5),
  status          text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id     int references employees(id),
  approver_comment text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  check (requested_out > requested_in)
);
create unique index regularisation_one_pending_per_day
  on regularisation_requests (employee_id, date) where status = 'pending';

-- ------------------------------------------------------------------ leave
create table leave_types (
  id                       serial primary key,
  code                     text not null unique,          -- CL, SL, EL, ML, PL, LOP
  name                     text not null,
  annual_quota             numeric(5,2),                  -- null = unlimited (LOP)
  accrual_method           text not null check (accrual_method in ('annual_prorata','monthly','on_request','none')),
  monthly_rate             numeric(4,2),                  -- EL: 1.25
  carry_forward_max        numeric(5,2) not null default 0,
  half_day_allowed         boolean not null default false,
  is_paid                  boolean not null default true,
  certificate_after_days   numeric(4,1),                  -- SL: certificate required if days > 2
  counts_calendar_days     boolean not null default false,-- ML: statutory weeks, counted in calendar days
  eligible_gender          text check (eligible_gender in ('Female','Male')),
  is_active                boolean not null default true,
  sort_order               int not null default 0
);

-- Stores only what cannot be derived: the opening (carried-forward) balance per year and any
-- manual HR adjustment. Accrued / used / pending / available are ALWAYS calculated.
create table leave_balances (
  employee_id    int not null references employees(id),
  leave_type_id  int not null references leave_types(id),
  year           int not null check (year between 2000 and 2100),
  opening        numeric(5,2) not null default 0 check (opening >= 0),
  adjustment     numeric(5,2) not null default 0,
  adjustment_note text,
  primary key (employee_id, leave_type_id, year)
);

create table leave_requests (
  id               serial primary key,
  employee_id      int not null references employees(id),
  leave_type_id    int not null references leave_types(id),
  from_date        date not null,
  to_date          date not null,
  is_half_day      boolean not null default false,
  days             numeric(5,1) not null check (days > 0),         -- working days (calendar for ML)
  lop_days         numeric(5,1) not null default 0 check (lop_days >= 0),  -- portion converted to LOP
  reason           text not null check (length(trim(reason)) >= 3),
  status           text not null check (status in ('draft','pending','approved','rejected','cancelled')),
  approver_id      int references employees(id),
  approver_comment text,
  created_via      text not null default 'form' check (created_via in ('form','agent','seed')),
  created_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  decided_at       timestamptz,
  check (to_date >= from_date),
  check (not is_half_day or from_date = to_date),
  check (lop_days <= days),
  check (extract(year from from_date) = extract(year from to_date)), -- one leave year per request
  -- an employee can never hold two live requests for the same day
  exclude using gist (employee_id with =, daterange(from_date, to_date, '[]') with &&)
    where (status in ('pending','approved'))
);
create index leave_requests_emp_idx on leave_requests (employee_id, from_date);
create index leave_requests_status_idx on leave_requests (status);

create table leave_attachments (
  id                serial primary key,
  leave_request_id  int not null unique references leave_requests(id),
  file_name         text not null,
  mime_type         text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes        int not null check (size_bytes <= 2097152),
  content           bytea not null,
  uploaded_at       timestamptz not null default now()
);

-- ------------------------------------------------------------------ policy, audit, email, agent
create table policy_documents (
  id          serial primary key,
  slug        text not null unique,          -- 'leave', 'attendance'
  title       text not null,
  body        text not null,
  updated_by  int references employees(id),
  updated_at  timestamptz not null default now()
);

create table audit_log (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text not null,
  field       text not null,
  old_value   text,
  new_value   text,
  reason      text,
  changed_by  int references employees(id),
  changed_at  timestamptz not null default now()
);
create index audit_log_record_idx on audit_log (table_name, record_id);

create table email_log (
  id          bigserial primary key,
  to_email    text not null,
  subject     text not null,
  body        text not null,
  status      text not null check (status in ('sent','logged_only','failed','draft','discarded')),
  error       text,
  related     text,
  created_by  int references employees(id),
  created_at  timestamptz not null default now()
);

create table agent_log (
  id          bigserial primary key,
  employee_id int not null references employees(id),
  question    text,
  tool        text not null,
  inputs      jsonb not null,
  result      jsonb,
  ok          boolean not null default true,
  created_at  timestamptz not null default now()
);
create index agent_log_emp_idx on agent_log (employee_id, created_at desc);
