import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { InstituteProfile } from './types'
import { relError } from './utils'

interface ProfileCtx {
  profile: InstituteProfile | null
  loading: boolean
  refresh: () => Promise<void>
  save: (patch: Partial<InstituteProfile>) => Promise<{ error?: string; success?: boolean }>
  uploadLogo: (file: File) => Promise<{ error?: string; url?: string }>
  removeLogo: () => Promise<void>
}

const Ctx = createContext<ProfileCtx>({
  profile: null,
  loading: true,
  refresh: async () => {},
  save: async () => ({ error: 'Provider not ready' }),
  uploadLogo: async () => ({ error: 'Provider not ready' }),
  removeLogo: async () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<InstituteProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('institute_profile')
      .select('*')
      .eq('id', 'main')
      .maybeSingle()
    if (error) {
      console.warn('Failed to load institute profile', relError(error))
    } else {
      setProfile(data as InstituteProfile | null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const save = useCallback(
    async (patch: Partial<InstituteProfile>) => {
      const { error } = await supabase
        .from('institute_profile')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 'main')
      if (error) return { error: relError(error) }
      await refresh()
      return { success: true }
    },
    [refresh]
  )

  const publicUrl = (path: string) => supabase.storage.from('branding').getPublicUrl(path).data.publicUrl

  const uploadLogo = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `logo.${ext}`
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
      if (error) return { error: relError(error) }
      const url = publicUrl(path)
      const res = await save({ logo_url: url })
      if (res.error) return res
      return { url }
    },
    [save]
  )

  const removeLogo = useCallback(async () => {
    await save({ logo_url: null })
  }, [save])

  return (
    <Ctx.Provider value={{ profile, loading, refresh, save, uploadLogo, removeLogo }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProfile() {
  return useContext(Ctx)
}