// Teacher-login factory. Called by the Admin UI as:
//   supabase.functions.invoke('create-teacher-login', { body: { ... } })
//
// Security:
//   * Runs server-side with SUPABASE_SERVICE_ROLE_KEY (never shipped to browsers).
//   * Refuses the request unless the CALLER's JWT belongs to the Admin (role
//     'admin' in user_profiles).
//   * Creates/resets the Auth user through GoTrue's Admin API (fully-compatible
//     users + identities rows), then links user_profiles -> teachers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Unauthorized' })

  const service = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1. Who is calling?
  const { data: { user: caller }, error: callerErr } = await service.auth.getUser(token)
  if (callerErr || !caller) return json(401, { error: 'Unauthorized' })

  const { data: profile } = await service
    .from('user_profiles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle()
  if (!profile || profile.role !== 'admin') {
    return json(403, { error: 'Only the Admin can create teacher logins' })
  }

  // 2. Payload sanity
  const body = await req.json()
  const p_teacher_id: string = body.p_teacher_id ?? ''
  const p_email: string = (body.p_email ?? '').trim().toLowerCase()
  const p_password: string = body.p_password ?? ''

  if (!p_email.includes('@')) return json(400, { error: 'A valid email is required' })
  if (p_password.length < 8) return json(400, { error: 'Password must be at least 8 characters' })

  const { data: teacher } = await service
    .from('teachers')
    .select('id, user_id, name')
    .eq('id', p_teacher_id)
    .maybeSingle()
  if (!teacher) return json(404, { error: 'Teacher record not found' })

  // 3. Create or reset the Auth account (GoTrue Admin API -> valid users/identities)
  let userId: string | undefined
  let created = false

  if (teacher.user_id) {
    const { error } = await service.auth.admin.updateUserById(teacher.user_id, {
      email: p_email,
      password: p_password,
      email_confirm: true,
      user_metadata: { full_name: teacher.name, name: teacher.name },
    })
    if (error) return json(400, { error: error.message })
    userId = teacher.user_id
  } else {
    const { data: newUser, error: createErr } = await service.auth.admin.createUser({
      email: p_email,
      password: p_password,
      email_confirm: true,
      user_metadata: { full_name: teacher.name, name: teacher.name },
    })
    if (createErr) {
      // Email already registered? Reuse that account instead of failing.
      const { data: existing } = await service
        .schema('auth')
        .from('users')
        .select('id')
        .eq('email', p_email)
        .maybeSingle()
      if (!existing) return json(400, { error: createErr.message })
      const { error: upErr } = await service.auth.admin.updateUserById(existing.id, {
        email: p_email,
        password: p_password,
        email_confirm: true,
        user_metadata: { full_name: teacher.name, name: teacher.name },
      })
      if (upErr) return json(400, { error: upErr.message })
      userId = existing.id
    } else {
      userId = newUser.id
      created = true
    }
  }

  // 4. Link login <-> teacher and audit
  await service.from('user_profiles').upsert(
    { user_id: userId, role: 'teacher', teacher_id: p_teacher_id },
    { onConflict: 'user_id' },
  )
  await service.from('teachers').update({ user_id: userId }).eq('id', p_teacher_id)
  await service.from('audit_logs').insert({
    action: created ? 'CREATE_LOGIN' : 'RESET_LOGIN',
    entity: 'TEACHER',
    record_id: p_teacher_id,
    detail: { email: p_email, user_id: userId },
  })

  return json(200, { ok: true, created, user_id: userId, email: p_email })
})