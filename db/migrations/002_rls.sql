-- Row-level security.
--
-- The app never talks to Supabase through the browser or the PostgREST API. All reads and
-- writes go through Next.js server code that connects with the database owner role, after
-- the server has checked the signed-in user's role. RLS is therefore a second wall: if the
-- Supabase anon / authenticated API keys ever leak, those roles see NOTHING, and the
-- statutory and bank tables are locked hardest (forced RLS + no grants at all).

alter table employee_statutory enable row level security;
alter table employee_statutory force row level security;
alter table employee_bank      enable row level security;
alter table employee_bank      force row level security;

-- The owner role used by the server needs an explicit policy once RLS is forced.
do $$
begin
  execute format('create policy server_only on employee_statutory for all to %I using (true) with check (true)', current_user);
  execute format('create policy server_only on employee_bank      for all to %I using (true) with check (true)', current_user);
end $$;

-- Every other table: RLS on, no policies → deny-all for API roles.
alter table locations               enable row level security;
alter table departments             enable row level security;
alter table employees               enable row level security;
alter table holidays                enable row level security;
alter table attendance              enable row level security;
alter table regularisation_requests enable row level security;
alter table leave_types             enable row level security;
alter table leave_balances          enable row level security;
alter table leave_requests          enable row level security;
alter table leave_attachments       enable row level security;
alter table policy_documents        enable row level security;
alter table audit_log               enable row level security;
alter table email_log               enable row level security;
alter table agent_log               enable row level security;

-- On Supabase, also revoke the default grants from the API roles.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
    end if;
  end loop;
end $$;
