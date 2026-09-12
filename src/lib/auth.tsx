import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { supabase } from './supabase'
import type { UserProfile, Teacher, AdminProfile, Role } from './types'
import { relError } from './utils'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  loading: boolean
  profile: UserProfile | null
  teacher: Teacher | null
  admin: AdminProfile | null
  role: Role | null
  isReady: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthCtx = createContext<AuthState>({
  session: null,
  loading: true,
  profile: null,
  teacher: null,
  admin: null,
  role: null,
  isReady: false,
  login: async () => ({}),
  logout: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [admin, setAdmin] = useState<AdminProfile | null>(null)
  const mountedRef = useRef(true)

  const loadProfile = useCallback(
    async (sess: Session | null) => {
      if (!sess?.user) {
        if (mountedRef.current) {
          setProfile(null)
          setTeacher(null)
          setAdmin(null)
        }
        return
      }
      const uid = sess.user.id
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle()

      if (!mountedRef.current) return
      setProfile(prof as UserProfile | null)

      if (prof?.role === 'teacher' && prof.teacher_id) {
        const { data: t } = await supabase
          .from('teachers')
          .select('*')
          .eq('id', prof.teacher_id)
          .maybeSingle()
        if (mountedRef.current) setTeacher(t as Teacher | null)
      } else if (prof?.role === 'admin') {
        const { data: a } = await supabase
          .from('admin_profile')
          .select('*')
          .eq('id', 'main')
          .maybeSingle()
        if (mountedRef.current) setAdmin(a as AdminProfile | null)
      }
    },
    []
  )

  const refresh = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    setSession(s)
    await loadProfile(s)
  }, [loadProfile])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!active) return
      setSession(s)
      await loadProfile(s)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return
      setSession(s)
      setLoading(true)
      await loadProfile(s)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: relError(error) }
    return {}
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setTeacher(null)
    setAdmin(null)
  }, [])

  const role = profile?.role ?? null
  const isReady = loading === false && session !== null && profile !== null

  return (
    <AuthCtx.Provider value={{ session, loading, profile, teacher, admin, role, isReady, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}