// Full off-machine JSON backup via the service role (bypasses RLS).
// Usage: node scripts/backup.mjs [--dir .\backups]
// Writes: <dir>/institute-backup-<timestamp>/ with data.json, schema.sql and README.txt
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(here, '..', '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const outDir = arg('dir') || path.join(here, '..', 'backups')

function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const TABLES = [
  'institute_profile',
  'admin_profile',
  'teachers',
  'students',
  'batches',
  'teacher_batches',
  'batch_students',
  'class_schedules',
  'classes',
  'attendance',
  'fee_records',
  'payments',
  'receipts',
  'audit_logs',
  'backups',
  'user_profiles',
]

// Sort column per table (some tables use a different timestamp column).
const ORDER_COL = {
  admin_profile: 'updated_at',
  teacher_batches: 'assigned_at',
  batch_students: 'joined_at',
}

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(outDir, 'institute-backup-' + stamp)
  mkdirSync(dir, { recursive: true })

  const all = {}
  let total = 0
  for (const table of TABLES) {
    let rows = []
    const pageSize = 1000
    let from = 0
    const orderCol = ORDER_COL[table] ?? 'created_at'
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error, count } = await sb
        .from(table)
        .select('*', { count: 'exact' })
        .order(orderCol, { ascending: true, nullsFirst: true })
        .range(from, from + pageSize - 1)
      if (error) {
        console.warn(`!! ${table}: ${error.message}`)
        break
      }
      rows = rows.concat(data)
      if (typeof count !== 'number' || from + pageSize >= count) break
      from += pageSize
    }
    all[table] = rows
    total += rows.length
    console.log(`${String(rows.length).padStart(5)}  ${table}`)
  }

  // Attempt to also grab the branding logo (storage) so it survives a restore.
  let logo = null
  try {
    const { data } = await sb.storage.from('branding').download('logo.png')
    if (data) logo = Buffer.from(await data.arrayBuffer()).toString('base64')
  } catch {
    try {
      const { data } = await sb.storage.from('branding').download('logo.webp')
      if (data) logo = Buffer.from(await data.arrayBuffer()).toString('base64')
    } catch {
      logo = null
    }
  }

  const payload = {
    backup_format: 1,
    created_at: new Date().toISOString(),
    app: 'coaching-manager',
    institute: all.institute_profile?.[0]?.institute_name ?? null,
    tables: all,
    branding_logo_base64: logo,
  }

  const dataFile = path.join(dir, 'data.json')
  writeFileSync(dataFile, JSON.stringify(payload, null, 2))
  writeFileSync(
    path.join(dir, 'README.txt'),
    [
      'Coaching Manager — off-machine backup',
      'Created : ' + payload.created_at,
      'Institute: ' + (payload.institute || '(not set)'),
      '',
      'data.json    : every table, top-down in dependency order for a clean restore.',
      'schema.sql   : the full database schema (tables, triggers, RLS, stored procedures).',
      'logo         : branding logo, embedded in data.json (base64).',
      '',
      'Restore: apply schema.sql in the SQL editor of a fresh project, then import',
      'data.json with the app\'s Data Center → Import. Preserves stable IDs.',
      '',
      'Keep this folder somewhere safe (USB, Drive, another machine).',
    ].join('\n') + '\n'
  )
  try {
    const source = path.join(here, '..', 'supabase', 'migrations', '0001_init.sql')
    if (existsSync(source)) copyFileSync(source, path.join(dir, 'schema.sql'))
    else console.warn('!! schema.sql skipped: migration file not found')
  } catch (e) {
    console.warn('!! schema.sql skipped: ' + e.message)
  }

  console.log(`\nBackup complete: ${total} rows → ${dir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})