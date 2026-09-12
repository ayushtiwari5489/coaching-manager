import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, FileDown, IndianRupee } from 'lucide-react'
import { fetchById, fetchBy } from '../../lib/api'
import type { Receipt, Payment, Student, FeeRecord, Batch, BatchStudent } from '../../lib/types'
import { Button, Card, PageLoader, useToast } from '../../components/ui'
import { useProfile } from '../../lib/profile'
import { InstituteLogo } from '../../components/branding'
import { formatDate, formatINR, monthLabel } from '../../lib/utils'

export default function ReceiptView() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useProfile()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [fee, setFee] = useState<FeeRecord | null>(null)
  const [batchNames, setBatchNames] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await fetchById<Receipt>('receipts', id)
      if (!r) {
        toast('Receipt not found', 'error')
        return
      }
      setReceipt(r)
      const [p, s, f, bs] = await Promise.all([
        fetchById<Payment>('payments', r.payment_id),
        fetchById<Student>('students', r.student_id),
        r.fee_record_id ? fetchById<FeeRecord>('fee_records', r.fee_record_id) : Promise.resolve(null),
        fetchBy<BatchStudent>('batch_students', 'student_id', r.student_id),
      ])
      setPayment(p)
      setStudent(s)
      setFee(f)
      const activeMemberships = bs.filter((m) => m.status === 'ACTIVE')
      if (activeMemberships.length > 0) {
        const names: string[] = []
        for (const m of activeMemberships) {
          const b = await fetchById<import('../../lib/types').Batch>('batches', m.batch_id)
          if (b && !b.deleted_at) names.push(b.name)
        }
        setBatchNames(names.join(', '))
      }
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    load()
  }, [load])

  const doPrint = () => window.print()

  if (loading || !receipt) return <PageLoader />

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to="/app/fees" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-200">
          <ArrowLeft className="h-4 w-4" /> Back to Fees
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={doPrint}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={doPrint}>
            <FileDown className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </div>

      <div id="print-area" className="card overflow-hidden p-0">
        <div className="border-b-4 border-brand-600 bg-white p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <InstituteLogo size={56} />
              <div>
                <h1 className="text-lg font-bold text-slate-900">{profile?.institute_name ?? 'Coaching Manager'}</h1>
                {profile?.tagline ? <p className="text-xs text-slate-500">{profile.tagline}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-bold text-white">OFFICIAL RECEIPT</p>
              <p className="mt-1.5 text-xs text-slate-500">Receipt No: <b className="text-slate-800">{receipt.receipt_number}</b></p>
              <p className="text-xs text-slate-500">Date: {formatDate(receipt.receipt_date)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
            <p>{profile?.address}</p>
            <p>City: {[profile?.locality, profile?.city, profile?.state].filter(Boolean).join(', ') || '—'}</p>
            <p>Phone: {profile?.phone || '—'} {profile?.whatsapp ? '· WhatsApp: ' + profile.whatsapp : ''}</p>
            <p>Email: {profile?.email || '—'}</p>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info label="Student" value={student?.name ?? '—'} />
            <Info label="Student ID" value={student?.id ?? '—'} />
            <Info label="Batch" value={batchNames || '—'} />
            <Info label="Fee Month" value={fee ? monthLabel(fee.fee_month) : '—'} />
          </div>

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3">Fee payment — {fee ? monthLabel(fee.fee_month) : '—'} ({receipt.method ?? '—'})</td>
                <td className="py-3 text-right text-base font-bold text-slate-900">{formatINR(receipt.amount)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900">
                <td className="py-3 font-bold text-slate-900">Total Paid</td>
                <td className="py-3 text-right text-base font-bold text-slate-900">{formatINR(receipt.amount)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Payment method: <b className="text-slate-600">{receipt.method ?? '—'}</b>
            </div>
            <div className="text-right">
              <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" /> Received by: {receipt.received_by ?? '—'}
              </p>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-400">
            Thank you · {profile?.institute_name ?? ''} · This is a computer-generated receipt.
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}