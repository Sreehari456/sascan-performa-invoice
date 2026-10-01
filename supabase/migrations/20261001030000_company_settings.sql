-- Company and bank details printed on every performa invoice, editable from
-- the Company details page. A single row, seeded with the values that were
-- previously hard-coded in lib/company.ts.
-- Safe to re-run: the table and seed row are only created if missing.

begin;

-- Keeps updated_at current. Defined in the initial schema migration, but
-- (re)created here in case a database was set up without it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.company_settings (
  -- Always true, so the table can only ever hold one row.
  id              boolean primary key default true check (id),
  name            text not null,
  address         text not null,  -- one printed line per text line
  mobile          text not null,
  email           text not null,
  gstin           text not null,
  bank_name       text not null,
  account_number  text not null,
  ifsc            text not null,
  bank_branch     text not null,
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

insert into public.company_settings
  (id, name, address, mobile, email, gstin, bank_name, account_number, ifsc, bank_branch)
values (
  true,
  'Sascan Meditech Pvt Ltd',
  E'SCTIMST-TIMed, 5th Floor M S Valiathan Medical Devices Block BMT Wing, Poojapura,\nThiruvananthapuram, Kerala 695012',
  '+91 9591345016',
  'sascanmeditech@gmail.com',
  '32AAVCS9773L1ZB',
  'HDFC',
  '59209591345016',
  'HDFC0005235',
  'HDFC Pappanamcode, Trivandrum'
)
on conflict (id) do nothing;

drop trigger if exists company_settings_set_updated_at on public.company_settings;
create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row
  execute function public.set_updated_at();

alter table public.company_settings enable row level security;

-- All staff can read the details (they're printed on every document).
drop policy if exists "Staff can read company settings" on public.company_settings;
create policy "Staff can read company settings"
  on public.company_settings for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- Only admins can change them. No insert/delete policies: the row is seeded above.
drop policy if exists "Admins can update company settings" on public.company_settings;
create policy "Admins can update company settings"
  on public.company_settings for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

commit;
