// Creates (or resets) the single Admin login.
// Usage: node scripts/create-admin.mjs   (reads ADMIN_* + service role key from .env)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(here, '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.ADMIN_EMAIL || 'admin@yourinstitute.example'
const password = process.env.ADMIN_PASSWORD || ''
const name = process.env.ADMIN_NAME || 'Institute Owner'

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.')
  process.exit(1)
}
if (!password) {
  console.error('ADMIN_PASSWORD is empty. Set a strong password in .env first.')
  process.exit(1)
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data: existing, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 })
  if (listErr) throw new Error('List users failed: ' + listErr.message)

  let userId = existing?.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())?.id

  if (userId) {
    console.log(`Admin login "${email}" already exists. Updating password.`)
    const { error } = await sb.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error('Update user failed: ' + error.message)
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    })
    if (error) throw new Error('Create user failed: ' + error.message)
    userId = data.user.id
    console.log(`Created admin login "${email}".`)
  }

  // Ensure the profile row links this user to the admin role.
  const { error: upErr } = await sb.from('user_profiles').upsert(
    { user_id: userId, role: 'admin' },
    { onConflict: 'user_id' }
  )
  if (upErr) throw new Error('Profile upsert failed: ' + upErr.message)

  const { error: apErr } = await sb.from('admin_profile').upsert(
    { id: 'main', admin_name: name },
    { onConflict: 'id' }
  )
  if (apErr) throw new Error('Admin profile upsert failed: ' + apErr.message)

  console.log('Done. Sign in at:')
  console.log('  URL     : ' + url.replace(/\/$/, '') + '/auth/v1/verify?token=')
  console.log('  Email   : ' + email)
  console.log('  Role    : admin (full access)')
  console.log('  Recovery: if the app ever loses this account, run this script again.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})