-- Performa invoice status (draft → sent → accepted / declined), emailing the
-- PDF to the customer, and a record of every email sent.
--
-- Additive and safe to re-run. Existing invoices start as 'draft'.

begin;

-- ---------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists status            text not null default 'draft',
  add column if not exists status_changed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_status_check') then
    alter table public.invoices
      add constraint invoices_status_check check (status in ('draft', 'sent', 'accepted', 'declined'));
  end if;
end;
$$;

create index if not exists invoices_status_idx on public.invoices (status);

-- Any staff member can move a quotation through its statuses (unlike editing
-- it, which only its creator can do). With p_only_if_draft, only a draft is
-- changed: used when emailing, so an accepted quotation doesn't go back to sent.
create or replace function public.set_quotation_status(p_id uuid, p_status text, p_only_if_draft boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid())) then
    raise exception 'Only staff can change a quotation''s status.' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'sent', 'accepted', 'declined') then
    raise exception 'Unknown status %.', p_status using errcode = '22023';
  end if;

  update public.invoices
  set status = p_status, status_changed_at = now()
  where id = p_id
    and document_type = 'quotation'
    and (not p_only_if_draft or status = 'draft')
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.invoices where id = p_id and document_type = 'quotation';
    if v_status is null then
      raise exception 'Quotation not found.' using errcode = 'P0002';
    end if;
  end if;
  return v_status;
end;
$$;

revoke execute on function public.set_quotation_status(uuid, text, boolean) from public, anon;
grant execute on function public.set_quotation_status(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer email address (remembered from the first email sent to them)
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists email text;

-- ---------------------------------------------------------------------------
-- Emails sent
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_emails (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  to_email            text not null,
  cc_email            text,
  subject             text not null,
  provider_message_id text,
  sent_by             uuid references public.profiles (id) on delete set null,
  sent_at             timestamptz not null default now()
);

create index if not exists invoice_emails_invoice_id_idx on public.invoice_emails (invoice_id, sent_at desc);

alter table public.invoice_emails enable row level security;

drop policy if exists "Staff can read invoice emails" on public.invoice_emails;
create policy "Staff can read invoice emails"
  on public.invoice_emails for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

drop policy if exists "Staff can record invoice emails they send" on public.invoice_emails;
create policy "Staff can record invoice emails they send"
  on public.invoice_emails for insert
  to authenticated
  with check (
    sent_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

commit;
