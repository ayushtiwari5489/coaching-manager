import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { relError } from './utils'

const KEY = 'cm_offline_attendance'

export interface QueuedAttendance {
  uid: string
  class_id: string
  rows: { student_id: string; status: string }[]
  created_at: string
}

export function getQueue(): QueuedAttendance[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedAttendance[]
  } catch {
    return []
  }
}

export function saveQueue(q: QueuedAttendance[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* ignore */
  }
}

export function enqueueAttendance(classId: string, rows: { student_id: string; status: string }[]) {
  const q = getQueue()
  q.push({
    uid: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    class_id: classId,
    rows,
    created_at: new Date().toISOString(),
  })
  saveQueue(q)
}

export async function syncQueue(onProgress?: (done: number, total: number) => void): Promise<{
  synced: number
  failed: number
  blocked: number
}> {
  const q = getQueue()
  if (q.length === 0) return { synced: 0, failed: 0, blocked: 0 }
  let synced = 0
  let failed = 0
  let blocked = 0
  const remaining: QueuedAttendance[] = []

  for (const item of q) {
    const { data, error } = await supabase.rpc('submit_attendance', {
      p_class_id: item.class_id,
      p_rows: item.rows.map((r) => ({ student_id: r.student_id, status: r.status })),
    })
    const res = data as { ok?: boolean; error?: string } | null
    if (!error && res?.ok) {
      synced += 1
    } else {
      // "already submitted" is a resolved state — drop the queued entry
      const alreadySubmitted =
        (res && /already submitted/i.test(res.error ?? '')) ||
        /already submitted/i.test(relError(error))
      if (alreadySubmitted) {
        blocked += 1
      } else {
        failed += 1
        remaining.push(item)
      }
    }
    onProgress?.(synced + failed + blocked, q.length)
  }
  saveQueue(remaining)
  return { synced, failed, blocked }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}