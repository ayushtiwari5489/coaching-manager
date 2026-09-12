// Creates a Teacher login (or an additional admin login) and links it to a
// teacher row so the teacher sees only their own batches.
//
// Usage:
//   node scripts/create-login.mjs --email teacher@institute.example --password '...' --name 'Ravi Kumar' --teacher-id TCH-00001
//   node scripts/create-login.mjs --email boss@institute.example --password '...' --name 'Owner' --role admin
//
// If --teacher-id is omitted a new teacher row is created (also linked).
// Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(here, '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = arg('email')
const password = arg('password') || process.env.ADMIN_PASSWORD
const name = arg('name') || 'Teacher'
const teacherId = arg('teacher-id')
const role = arg('role') === 'admin' ? 'admin' : 'teacher'

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.')
  process.exit(1)
}
if (!email || !password) {
  console.error('Usage: node scripts/create-login.mjs --email <email> --password <pass> [--name Name] [--teacher-id TCH-00001] [--role admin]')
  process.exit(1)
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function nextTeacherId() {
  // Mirrors the app's auto_id trigger: nextval(seq_tch) formatted with the TCH- prefix.
  const { data, error } = await sb.rpc('next_teacher_id')
  if (!error && data) return data
  const { data: n, error: nErr } = await sb.rpc('get_sequence_next', { n: 1 })
  if (!nErr && n) return 'TCH-' + String(n).padStart(5, '0')
  const { count } = await sb.from('teachers').select('*', { count: 'exact', head: true })
  return 'TCH-' + String((count || 0) + 1).padStart(5, '0')
}

async function main() {
  const { data: user, error: userErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  })
  if (userErr) throw new Error('Create user failed: ' + userErr.message)
  const userId = user.user.id
  console.log(`Created auth login "${email}" for "${name}".`)

  let linkedTeacherId = teacherId

  if (role === 'teacher') {
    if (!linkedTeacherId) {
      // Create a teacher row so the account can be assigned batches.
      const tid = await nextTeacherId()
      const { data: trow, error: tErr } = await sb.from('teachers')
        .insert({ id: tid, name, email, user_id: userId })
        .select('id')
        .single()
      if (tErr) throw new Error('Create teacher row failed: ' + tErr.message)
      linkedTeacherId = trow.id
      console.log(`Created teacher row ${trow.id} linked to this login.`)
    } else {
      // Link the login's user_id to the existing teacher row so the app can
      // match "my batches" by teacher id.
      const { error: linkErr } = await sb.from('teachers')
        .update({ user_id: userId })
        .eq('id', linkedTeacherId)
      if (linkErr) throw new Error('Link teacher failed: ' + linkErr.message)
      console.log(`Linked to teacher row ${linkedTeacherId}.`)
    }
  }

  const { error: upErr } = await sb.from('user_profiles').upsert(
    { user_id: userId, role, teacher_id: role === 'teacher' ? linkedTeacherId : null },
    { onConflict: 'user_id' }
  )
  if (upErr) throw new Error('Profile upsert failed: ' + upErr.message)

  console.log('Done. This account can now sign in at the app.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})