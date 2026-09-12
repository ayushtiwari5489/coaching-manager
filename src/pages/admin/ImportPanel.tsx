import { useEffect, useRef, useState } from 'react'
import { Upload, MapPin, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Modal, Button, Select, Field, Badge } from '../../components/ui'
import type { ImportEntity } from '../../lib/import'
import {
  parseFile,
  autoDetectEntity,
  buildColumnMap,
  mapRow,
  validateMapped,
  importRows,
  loadExistingIds,
  IMPORT_ENTITIES,
  FIELD_SYNONYMS,
} from '../../lib/import'
import { useToast } from '../../components/ui'
import { relError } from '../../lib/utils'

type Step = 'upload' | 'map' | 'validate' | 'importing' | 'done'

interface ParsedFile {
  fileName: string
  format: 'csv' | 'json'
  csvHeaders?: string[]
  csvRows?: Record<string, string>[]
}

export default function ImportPanel({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported?: () => void
}) {
  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [entity, setEntity] = useState<ImportEntity | null>(null)
  const [colMap, setColMap] = useState<Record<string, string>>({})
  const [mapped, setMapped] = useState<Record<string, unknown>[]>([])
  const [errors, setErrors] = useState<{ row: number; field: string; message: string }[]>([])
  const [messages, setMessages] = useState<string[]>([])
  const [parseError, setParseError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open) {
      setStep('upload')
      setParsed(null)
      setEntity(null)
      setColMap({})
      setMapped([])
      setErrors([])
      setMessages([])
      setParseError('')
    }
  }, [open])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setParseError('')
    try {
      const res = await parseFile(file)
      if (res.error) {
        setParseError(res.error)
        return
      }
      setParsed({
        fileName: file.name,
        format: res.format,
        csvHeaders: res.csvHeaders ?? [],
        csvRows: res.csvRows ?? [],
      })
      // auto-detect entity
      const keys = res.csvHeaders ?? []
      const detected = autoDetectEntity(keys)
      setEntity(detected)
      if (detected) setColMap(buildColumnMap(detected, keys))
      setStep('map')
    } catch (e) {
      setParseError(relError(e))
    } finally {
      setBusy(false)
    }
  }

  const csvPreview = parsed?.format === 'csv' ? (parsed.csvRows ?? []).slice(0, 5) : []

  const fieldsFor = (e: ImportEntity) => Object.keys(FIELD_SYNONYMS[e] ?? {})

  const rowsForEntity = (e: ImportEntity): Record<string, unknown>[] => {
    if (!parsed) return []
    return (parsed.csvRows ?? []).map((r) => mapRow(e, r, colMap))
  }

  const validate = async () => {
    if (!entity) return
    setBusy(true)
    try {
      const existing = await loadExistingIds()
      const rows = rowsForEntity(entity)
      const { records, errors: errs } = validateMapped(entity, rows, existing)
      setMapped(records)
      setErrors(errs)
      // prefill receipt fields not reachable for json — handled below
      void records
      setStep('validate')
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!entity) return
    setStep('importing')
    setBusy(true)
    try {
      const res = await importRows(entity, mapped)
      setMessages(res.messages)
      if (res.errors.length > 0) {
        setErrors((prev) => [...prev, ...res.errors.slice(0, 20).map((m) => ({ row: 0, field: 'import', message: m }))])
        toast(`${res.errors.length} rows failed.`, 'error')
      } else {
        toast('Import complete.')
      }
      setStep('done')
      onImported?.()
    } catch (e) {
      toast(relError(e), 'error')
      setStep('validate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Data"
      size="lg"
      footer={
        step === 'map' ? (
          <Button onClick={validate} disabled={busy}>Validate &amp; preview</Button>
        ) : step === 'validate' ? (
          <Button onClick={doImport} disabled={busy}>{`Import ${mapped.length} records`}</Button>
        ) : step === 'done' ? (
          <Button onClick={onClose}>Close</Button>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Step 1 */}
        {step === 'upload' && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <div
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center hover:border-brand-400 hover:bg-brand-50"
            >
              <Upload className="h-8 w-8 text-brand-600" />
              <p className="text-sm font-medium text-slate-700">Click to choose a CSV or JSON file</p>
              <p className="text-xs text-slate-400">
                CSV works for students, teachers, batches, attendance, fees and payments. JSON can include any of these.
              </p>
            </div>
            {parseError ? <p className="mt-2 text-sm text-red-600">{parseError}</p> : null}
          </div>
        )}

        {/* Step 2 mapping */}
        {step === 'map' && parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge tone="blue">{parsed.fileName}</Badge>
              <Badge tone="slate">{parsed.format.toUpperCase()}</Badge>
            </div>

            <Field label="What does this file contain?" required>
              <Select value={entity ?? ''} onChange={(e) => {
                const v = e.target.value as ImportEntity
                setEntity(v)
                if (parsed.format === 'csv') setColMap(buildColumnMap(v, parsed.csvHeaders ?? []))
              }}>
                <option value="" disabled>Select…</option>
                {IMPORT_ENTITIES.map((en) => (
                  <option key={en.value} value={en.value}>{en.label}</option>
                ))}
              </Select>
            </Field>

            {entity && parsed.format === 'csv' ? (
              <>
                <div className="rounded-lg border border-slate-100">
                  <p className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <MapPin className="h-3.5 w-3.5" /> Map columns
                  </p>
                  <div className="space-y-1.5 p-3">
                    {fieldsFor(entity).map((f) => (
                      <div key={f} className="grid grid-cols-2 items-center gap-2 text-sm">
                        <span className="capitalize text-slate-600">{f.replace(/_/g, ' ')}</span>
                        <Select value={colMap[f] ?? ''} onChange={(e) => setColMap({ ...colMap, [f]: e.target.value })}>
                          <option value="">— skip —</option>
                          {(parsed.csvHeaders ?? []).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100">
                  <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                  <div className="overflow-x-auto p-2">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100">
                        <tr>
                          {fieldsFor(entity).filter((f) => colMap[f]).map((f) => (
                            <th key={f} className="px-2 py-1 font-semibold text-slate-500">{f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((r, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            {fieldsFor(entity).filter((f) => colMap[f]).map((f) => (
                              <td key={f} className="px-2 py-1 text-slate-700">{r[colMap[f]] ?? '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {parsed.csvRows?.length ?? 0} data rows · Stable IDs in the CSV are preserved. Missing IDs get new ones.
                </p>
              </>
            ) : null}

            {entity && parsed.format === 'json' ? (
              <p className="text-sm text-slate-500">
                JSON detected with {parsed.csvRows?.length ?? 0} rows. Map the columns above just like a CSV, then
                continue.
              </p>
            ) : null}
          </div>
        )}

        {/* Step 3 validation */}
        {step === 'validate' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {errors.length === 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="text-sm font-medium text-green-700">All {mapped.length} rows validated.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="text-sm font-medium text-amber-700">
                    {errors.length} issue{errors.length === 1 ? '' : 's'} found — review before importing.
                  </p>
                </>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100">
              {errors.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  Ready to import {mapped.length} rows. IDs and relationships already in the database will be checked
                  during import.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-slate-500">Row</th>
                      <th className="px-3 py-2 text-slate-500">Field</th>
                      <th className="px-3 py-2 text-slate-500">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.slice(0, 50).map((e, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-3 py-1.5 font-mono">{e.row || '—'}</td>
                        <td className="px-3 py-1.5">{e.field}</td>
                        <td className="px-3 py-1.5 text-red-600">{e.message}</td>
                      </tr>
                    ))}
                    {errors.length > 50 ? (
                      <tr><td className="px-3 py-1.5 text-slate-400" colSpan={3}>…and {errors.length - 50} more</td></tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Step 4 done */}
        {step === 'done' && (
          <div className="space-y-2">
            {messages.map((m, i) => (
              <p key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> {m}
              </p>
            ))}
            {errors.filter((e) => e.field === 'import').map((e, i) => (
              <p key={i} className="flex items-start gap-2 text-sm text-red-600">
                <X className="mt-0.5 h-4 w-4 shrink-0" /> {e.message}
              </p>
            ))}
            <p className="pt-2 text-xs text-slate-400">
              The import is recorded in the audit log. Re-importing the same data is safe for attendance (duplicates are
              prevented at the database level).
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}