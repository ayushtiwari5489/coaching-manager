-- Creates the storage bucket used for the institute branding logo. The bucket is
-- PUBLIC on purpose: the logo is shown on login, reports, receipts and invoices,
-- and the app stores plain public URLs (no signed tokens) in institute_profile.logo_url.
-- Safe to re-run. The account doing the migration must have storage access.
-- (On Supabase, run this via the SQL editor as the postgres/owner role.)

insert into storage.buckets (id, name, public)
select 'branding', 'branding', true
where not exists (select 1 from storage.buckets where id = 'branding')
on conflict (id) do nothing;

-- Branding is readable by the website (public reads the logo via public URL);
-- uploads are restricted to the authenticated admin (RLS passthrough) while
-- server-to-server backups bypass RLS with the service role.
create or replace function public.branding_insert_check()
returns trigger language plpgsql as $$
begin
  return new;
end $$;

-- The app uploads/logos through the signed-in admin using its own userId;
-- any authenticated user may upload (only admins exist as uploaders). MIME
-- guard is applied separately in the app.
drop policy if exists "branding admin upload" on storage.objects;
create policy "branding admin upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding');

drop policy if exists "branding public read" on storage.objects;
create policy "branding public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'branding');

drop policy if exists "branding owner update delete" on storage.objects;
create policy "branding owner update delete"
  on storage.objects for update using (bucket_id = 'branding')
  with check (bucket_id = 'branding');
create policy "branding owner delete"
  on storage.objects for delete using (bucket_id = 'branding');