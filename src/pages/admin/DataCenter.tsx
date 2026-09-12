import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Database,
  Download,
  Archive,
  Upload,
  FileDown,
  FileText,
  RefreshCw,
  HardDrive,
  CheckCircle2,
} from 'lucide-react'
import { fetchAll } from '../../lib/api'
import { doBackup, doExport, exportEverythingJSON, fetchBackupHistory, downloadDatabaseSchema } from '../../lib/export'
import type { BackupRecord, TableName } from '../../lib/types'
import { Button, Card, Badge, PageLoader, EmptyState, useToast } from '../../components/ui'
import { formatDateTime, formatDate, relError } from '../../lib/utils'
import { TABLE_LABELS } from '../../lib/export'
import ImportPanel from './ImportPanel'

const EXPORTABLE: TableName[] = [
  'students',
  'teachers',
  'batches',
  'batch_students',
  'teacher_batches',
  'class_schedules',
  'classes',
  'attendance',
  'fee_records',
  'payments',
  'receipts',
  'audit_logs',
]

export default function DataCenter() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<BackupRecord[]>([])
  const [status, setStatus] = useState<'loading' | 'healthy' | 'error'>('loading')
  const [busy, setBusy] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [s, t, b, bs, tb, cs, c, att, f, p, r, h] = await Promise.all([
        fetchAll('students'),
        fetchAll('teachers'),
        fetchAll('batches'),
        fetchAll('batch_students'),
        fetchAll('teacher_batches'),
        fetchAll('class_schedules'),
        fetchAll('classes'),
        fetchAll('attendance'),
        fetchAll('fee_records'),
        fetchAll('payments'),
        fetchAll('receipts'),
        fetchBackupHistory(),
      ])
      setCounts({
        students: s.length,
        teachers: t.length,
        batches: b.length,
        batch_students: bs.length,
        teacher_batches: tb.length,
        class_schedules: cs.length,
        classes: c.length,
        attendance: att.length,
        fee_records: f.length,
        payments: p.length,
        receipts: r.length,
      })
      setHistory(h)
      setStatus('healthy')
    } catch (e) {
      setStatus('error')
      toast(relError(e), 'error')
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const lastBackup = history.find((h) => h.status === 'SUCCESS')

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
      toast('Done.')
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Data Control Center</h1>
          <p className="text-sm text-slate-500">Your data belongs to you. Export, back up, import and verify it here.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Health */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <Database className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Database</p>
              <p className="text-xs text-slate-500">PostgreSQL · single institute</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-700">Last successful backup</p>
            <p className="text-xs text-slate-500">
              {lastBackup ? formatDateTime(lastBackup.created_at) + ` (${lastBackup.filename})` : 'Never — create one below'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
          {['students', 'teachers', 'batches', 'attendance', 'fee_records', 'payments'].map((k) => (
            <div key={k} className="rounded-lg border border-slate-100 py-2">
              <p className="text-lg font-bold text-slate-900">{counts[k] ?? '—'}</p>
              <p className="text-[11px] text-slate-500">{TABLE_LABELS[k as TableName]}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3">
          {status === 'healthy' ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Database className="h-5 w-5 text-amber-600" />
          )}
          <p className={`text-sm font-medium ${status === 'healthy' ? 'text-green-700' : 'text-amber-700'}`}>
            {status === 'healthy' ? 'Database: Healthy' : status === 'error' ? 'Database: Unreachable — check your connection' : 'Checking…'}
          </p>
          <p className="ml-auto hidden text-xs text-slate-400 sm:block">
            Backup is independent from the live database. Run backups regularly.
          </p>
        </div>
      </Card>

      {/* Primary actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActionTile
          icon={<Archive className="h-5 w-5" />}
          title="Export Everything"
          desc="Complete ZIP backup: CSVs, JSON, schema, README"
          busy={busy === 'export-everything'}
          onClick={() => run('export-everything', () => doBackup().then((r) => toast(`${r.filename} saved.`)))}
        />
        <ActionTile
          icon={<HardDrive className="h-5 w-5" />}
          title="Export Everything (JSON)"
          desc="Single portable JSON file with all tables"
          busy={busy === 'export-json'}
          onClick={() => run('export-json', () => exportEverythingJSON())}
        />
        <ActionTile
          icon={<Upload className="h-5 w-5" />}
          title="Import Data"
          desc="CSV or JSON · preview, map, validate, import"
          busy={false}
          onClick={() => setImportOpen(true)}
        />
        <ActionTile
          icon={<FileText className="h-5 w-5" />}
          title="Download Database Schema"
          desc="SQL definitions of every table & constraint"
          busy={busy === 'schema'}
          onClick={() => run('schema', () => downloadDatabaseSchema())}
        />
      </div>

      {/* Per-table export */}
      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
          <FileDown className="h-5 w-5" /> Export individual tables
        </h2>
        <p className="mb-3 text-xs text-slate-500">CSV works with Excel, Google Sheets, LibreOffice, Python and other systems.</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTABLE.map((t) => (
            <div key={t} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">{TABLE_LABELS[t]}</span>
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy === `csv-${t}`}
                  onClick={() => run(`csv-${t}`, () => doExport(t, 'csv'))}
                >
                  CSV
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy === `json-${t}`}
                  onClick={() => run(`json-${t}`, () => doExport(t, 'json'))}
                >
                  JSON
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Backup history */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Backup history</h2>
        {history.length === 0 ? (
          <EmptyState title="No backups yet" hint="Backups are recorded here after you create them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Kind</th>
                  <th className="th">File</th>
                  <th className="th">Size</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">{formatDateTime(h.created_at)}</td>
                    <td className="td"><Badge tone={h.kind === 'FULL' ? 'blue' : 'slate'}>{h.kind}</Badge></td>
                    <td className="td font-mono text-xs">{h.filename ?? '—'}</td>
                    <td className="td">{h.size_bytes ? `${(h.size_bytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="td">
                      <Badge tone={h.status === 'SUCCESS' ? 'green' : 'red'}>{h.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Portability note */}
      <Card className="border-brand-100 bg-brand-50/50">
        <h2 className="mb-1 text-base font-semibold text-brand-900">Data portability</h2>
        <p className="text-sm text-brand-800">
          Every export uses standard CSV/JSON formats with stable IDs (STU-00001, TCH-00001, …). Relationships are
          preserved by these IDs. You can import your data into any other system that reads CSV or JSON, apply
          <code className="mx-1 rounded bg-white px-1">database_schema.sql</code> to any PostgreSQL server, or restore it
          into a new Supabase project. No vendor lock-in.
        </p>
      </Card>

      <div className="no-print">
        <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      </div>
    </div>
  )
}

function ActionTile({
  icon,
  title,
  desc,
  onClick,
  busy,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
  busy: boolean
}) {
  return (
    <Button variant="secondary" className="!h-auto flex-col items-start gap-1.5 !p-4 text-left" onClick={onClick} disabled={busy}>
      <span className="text-brand-600">{icon}</span>
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <span className="text-xs font-normal text-slate-500">{desc}</span>
    </Button>
  )
}