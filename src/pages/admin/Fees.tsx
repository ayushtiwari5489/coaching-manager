import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IndianRupee, Plus, RefreshCw, FileBadge, Search } from 'lucide-react'
import {
  fetchAll,
  upsertRow,
  recordPayment,
  recomputeFeeStatus,
  logAudit,
  fetchBy,
} from '../../lib/api'
import type { FeeRecord, Student, Batch, Payment, Receipt, PaymentMethod, BatchStudent } from '../../lib/types'
import {
  Button,
  Card,
  Input,
  Select,
  Field,
  Modal,
  Badge,
  Table,
  Th,
  Td,
  PageLoader,
  EmptyState,
  StatCard,
  useToast,
} from '../../components/ui'
import { formatDate, formatINR, monthLabel, monthFirst, todayISO, relError } from '../../lib/utils'

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER']

export default function Fees() {
  const [fees, setFees] = useState<FeeRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [memberships, setMemberships] = useState<BatchStudent[]>([])
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({})
  const [loading, setLoading] = useState(true)
  const [monthFilter, setMonthFilter] = useState(monthFirst(todayISO()))
  const [search, setSearch] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateMonth, setGenerateMonth] = useState(monthFirst(todayISO()))
  const [payFor, setPayFor] = useState<{ fee: FeeRecord; student: Student } | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [f, s, b, m, payRows, recRows] = await Promise.all([
        fetchAll<FeeRecord>('fee_records', { order: 'fee_month', ascending: false }),
        fetchAll<Student>('students'),
        fetchAll<Batch>('batches'),
        fetchAll<BatchStudent>('batch_students'),
        fetchAll<Payment>('payments'),
        fetchAll<Receipt>('receipts'),
      ])
      setFees(f)
      setStudents(s)
      setBatches(b)
      setMemberships(m)
      setPayments(payRows)
      const recMap: Record<string, Receipt> = {}
      for (const r of recRows) recMap[r.payment_id] = r
      setReceipts(recMap)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const sMap = new Map(students.map((s) => [s.id, s]))
  const batchNameOf = (studentId: string) => {
    const bid = memberships.find((m) => m.student_id === studentId && m.status === 'ACTIVE')?.batch_id
    return bid ? batches.find((b) => b.id === bid)?.name ?? '' : ''
  }

  const generateFees = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const activeStudents = students.filter((s) => s.status === 'ACTIVE')
      let created = 0
      let skipped = 0
      for (const s of activeStudents) {
        const exists = fees.some((f) => f.student_id === s.id && f.fee_month === generateMonth)
        if (exists) {
          skipped += 1
          continue
        }
        await upsertRow('fee_records', [
          {
            student_id: s.id,
            fee_month: generateMonth,
            amount: s.monthly_fee || 0,
            due_date: null,
            paid_amount: 0,
            status: 'PENDING',
          },
        ])
        created += 1
      }
      await logAudit('GENERATE_FEES', 'FEES', generateMonth, { created, skipped })
      toast(`Fee records created for ${created} students (${skipped} already existed).`)
      setGenerateOpen(false)
      setMonthFilter(generateMonth)
      await load()
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const doRecordPayment = async (e: FormEvent) => {
    e.preventDefault()
    if (!payFor) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) {
      toast('Enter a valid amount', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await recordPayment({
        studentId: payFor.student.id,
        feeRecordId: payFor.fee.id,
        paymentDate: payDate,
        amount,
        method: payMethod,
        note: payNote || undefined,
      })
      if (!res.ok) {
        toast(res.error ?? 'Payment failed', 'error')
        return
      }
      toast(`Payment recorded. Receipt ${res.receipt_id}.`)
      setPayFor(null)
      setPayAmount('')
      setPayNote('')
      await load()
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader />

  const monthFees = fees.filter((f) => f.fee_month === monthFilter)
  const searched = monthFees.filter((f) => {
    const q = search.trim().toLowerCase()
    const st = sMap.get(f.student_id)
    return !q || (st?.name.toLowerCase().includes(q) ?? false) || f.student_id.includes(q)
  })

  const totals = {
    collected: monthFees.reduce((a, f) => a + f.paid_amount, 0),
    pending: monthFees.reduce((a, f) => a + Math.max(0, f.amount - f.paid_amount), 0),
    overdue: fees.filter((f) => f.status === 'OVERDUE').reduce((a, f) => a + Math.max(0, f.amount - f.paid_amount), 0),
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fees & Payments</h1>
          <p className="text-sm text-slate-500">{monthLabel(monthFilter)}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await recomputeFeeStatus()
                toast('Fee statuses recalculated.')
                await load()
              } catch (e) {
                toast(relError(e), 'error')
              }
            }}
          >
            <RefreshCw className="h-4 w-4" /> Recalculate
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="h-4 w-4" /> Generate month fees
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Collected this month" value={formatINR(totals.collected)} icon={<IndianRupee className="h-5 w-5" />} tone="green" />
        <StatCard label="Pending this month" value={formatINR(totals.pending)} icon={<IndianRupee className="h-5 w-5" />} tone="amber" />
        <StatCard label="Total overdue" value={formatINR(totals.overdue)} icon={<IndianRupee className="h-5 w-5" />} tone="red" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input type="month" className="w-44" value={monthFilter.slice(0, 7)} onChange={(e) => setMonthFilter(e.target.value ? e.target.value + '-01' : monthFilter)} />
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="!p-0">
        {searched.length === 0 ? (
          <EmptyState
            title="No fee records for this month"
            hint="Generate the month's fee records to get started."
            action={<Button onClick={() => setGenerateOpen(true)}><Plus className="h-4 w-4" /> Generate month fees</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Student</Th>
                  <Th>Batch</Th>
                  <Th>Fee</Th>
                  <Th>Paid</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th className="!text-right">Receipt</Th>
                </tr>
              </thead>
              <tbody>
                {searched.map((f) => {
                  const st = sMap.get(f.student_id)
                  const balance = Math.max(0, f.amount - f.paid_amount)
                  return (
                    <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <Td>
                        <Link to={`/app/students/${f.student_id}`} className="font-medium text-slate-900 hover:underline">
                          {st?.name ?? f.student_id}
                        </Link>
                        <div className="text-xs font-mono text-slate-400">{f.student_id}</div>
                      </Td>
                      <Td>{batchNameOf(f.student_id) || '—'}</Td>
                      <Td>{formatINR(f.amount)}</Td>
                      <Td>{formatINR(f.paid_amount)}</Td>
                      <Td className={balance > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{formatINR(balance)}</Td>
                      <Td>
                        <Badge tone={{ PAID: 'green', PARTIAL: 'amber', PENDING: 'slate', OVERDUE: 'red' }[f.status]!}>{f.status}</Badge>
                      </Td>
                      <Td>
                        {balance > 0 ? (
                          <Button
                            variant="secondary"
                            className="!px-2.5 !py-1.5 text-xs"
                            onClick={() => {
                              setPayFor({ fee: f, student: st ?? { id: f.student_id, name: f.student_id } as Student })
                              setPayAmount(String(balance))
                              setPayMethod('CASH')
                              setPayDate(todayISO())
                              setPayNote('')
                            }}
                          >
                            Record payment
                          </Button>
                        ) : (
                          <span className="text-xs text-green-600">Fully paid</span>
                        )}
                      </Td>
                      <Td className="!text-right">
                        {latestReceiptId(f.id, payments, receipts) ? (
                          <Link to={`/app/receipts/${latestReceiptId(f.id, payments, receipts)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                            <FileBadge className="h-3.5 w-3.5" /> View
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Generate month fees */}
      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate monthly fee records"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={generateFees} disabled={saving}>{saving ? 'Creating…' : 'Generate'}</Button>
          </>
        }
      >
        <form onSubmit={generateFees} className="space-y-3">
          <Field label="Fee month">
            <Input type="month" value={generateMonth.slice(0, 7)} onChange={(e) => setGenerateMonth(e.target.value ? e.target.value + '-01' : generateMonth)} />
          </Field>
          <p className="text-sm text-slate-500">
            Creates one fee record for every ACTIVE student, using their monthly fee. Existing records are skipped.
          </p>
        </form>
      </Modal>

      {/* Record payment */}
      <Modal
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title={`Record payment — ${payFor?.student.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayFor(null)} disabled={saving}>Cancel</Button>
            <Button onClick={doRecordPayment} disabled={saving}>{saving ? 'Recording…' : 'Record & create receipt'}</Button>
          </>
        }
      >
        <form onSubmit={doRecordPayment} className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p><span className="text-slate-500">Month:</span> <b>{payFor ? monthLabel(payFor.fee.fee_month) : ''}</b></p>
            <p><span className="text-slate-500">Fee:</span> <b>{payFor ? formatINR(payFor.fee.amount) : ''}</b></p>
            <p><span className="text-slate-500">Already paid:</span> {payFor ? formatINR(payFor.fee.paid_amount) : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" required>
              <Input type="number" min="1" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
            <Field label="Date" required>
              <Input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Payment method" required>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button key={m} type="button" onClick={() => setPayMethod(m)}
                  className={payMethod === m ? 'rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white' : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600'}>
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Note (optional)">
            <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </Field>
          <p className="text-xs text-slate-400">
            A receipt (REC-xxxxx) is generated automatically. Receipts carry the institute branding from Settings.
          </p>
        </form>
      </Modal>
    </div>
  )
}

function latestReceiptId(feeRecordId: string, payments: Payment[], receipts: Record<string, Receipt>): string | null {
  const forFee = payments
    .filter((p) => p.fee_record_id === feeRecordId)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
  if (forFee.length === 0) return null
  const last = forFee[forFee.length - 1]
  return receipts[last.id]?.id ?? null
}