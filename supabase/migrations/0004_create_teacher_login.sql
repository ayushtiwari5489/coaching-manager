-- Creates (or resets) a Teacher login entirely server-side, invoked from the
-- Admin UI. No service-role key ever touches the browser or terminals.
--
-- How it works:
--   * The function is SECURITY DEFINER, so it runs with full privileges.
--   * It refuses to run unless the CALLER is the Admin (is_admin()).
--   * It creates/updates the auth.users account + auth.identities row exactly
--     like the Supabase Admin API does, then links user_profiles -> teachers.
--
-- Apply this file once in the SQL editor. Re-running is safe (create or replace).

create or replace function public.create_teacher_login(
  p_teacher_id text,
  p_name      text,
  p_email     text,
  p_password  text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid;
  v_existing uuid;
  v_teacher  boolean;
begin
  -- Only the signed-in Admin may create logins.
  if not public.is_admin() then
    raise exception 'Only the Admin can create teacher logins';
  end if;

  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'A valid email is required';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  select exists (
    select 1 from public.teachers where id = p_teacher_id and deleted_at is null
  ) into v_teacher;
  if not v_teacher then
    raise exception 'Teacher record not found';
  end if;

  -- Reuse the account if it already exists (password reset), else create it.
  select id into v_existing from auth.users where lower(email) = lower(p_email);

  if v_existing is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', lower(p_email),
      crypt(p_password, gen_salt('bf', 10)),
      now(), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', p_name, 'full_name', p_name),
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid()::text, v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', lower(p_email), 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  else
    v_uid := v_existing;
    update auth.users
      set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
          raw_user_meta_data  = jsonb_build_object('name', p_name, 'full_name', p_name),
          updated_at          = now()
      where id = v_uid;
  end if;

  -- Link the login to the teacher record (this is what scopes "my batches").
  insert into public.user_profiles (user_id, role, teacher_id)
  values (v_uid, 'teacher', p_teacher_id)
  on conflict (user_id) do update
    set teacher_id = excluded.teacher_id, role = 'teacher';

  update public.teachers
    set user_id = v_uid, updated_at = now()
  where id = p_teacher_id;

  insert into public.audit_logs (action, entity, record_id, detail)
  values (
    case when v_existing is null then 'CREATE_LOGIN' else 'RESET_LOGIN' end,
    'TEACHER', p_teacher_id,
    jsonb_build_object('email', lower(p_email), 'user_id', v_uid::text)
  );

  return jsonb_build_object(
    'ok', true,
    'created', v_existing is null,
    'user_id', v_uid::text,
    'email', lower(p_email)
  );
end $$;

-- Only authenticated users (i.e. the logged-in admin) may call this RPC.
revoke execute on function public.create_teacher_login(text, text, text, text) from public, anon;
grant execute on function public.create_teacher_login(text, text, text, text) to authenticated;

-- Re-deny any direct table writes from anonymous roles that nobody needs.
revoke all on table public.user_profiles from anon;
revoke all on table public.teachers from anon;