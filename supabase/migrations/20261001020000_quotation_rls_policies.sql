-- Row Level Security policies for quotations.
-- Changes access rules only: no tables or columns are added, changed or removed.
-- Safe to re-run.
--
-- "Staff" = a signed-in user who has a row in public.profiles.
-- Admin vs accounts permissions will be refined when role management is built.

begin;

-- profiles: each user can read their own profile.
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- invoices: all staff can read quotations (needed to assign the next number).
drop policy if exists "Staff can read invoices" on public.invoices;
create policy "Staff can read invoices"
  on public.invoices for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- invoices: staff can create quotations under their own profile only.
drop policy if exists "Staff can create their own invoices" on public.invoices;
create policy "Staff can create their own invoices"
  on public.invoices for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

-- invoices: creators can delete their own (used to roll back a failed save).
drop policy if exists "Creators can delete their own invoices" on public.invoices;
create policy "Creators can delete their own invoices"
  on public.invoices for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- invoice_items: readable when the parent invoice is readable.
drop policy if exists "Staff can read invoice items" on public.invoice_items;
create policy "Staff can read invoice items"
  on public.invoice_items for select
  to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));

-- invoice_items: can be added only to invoices the user created.
drop policy if exists "Creators can add invoice items" on public.invoice_items;
create policy "Creators can add invoice items"
  on public.invoice_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.created_by = (select auth.uid())
    )
  );

commit;
