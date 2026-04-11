import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

export function useAuth() {
  const {
    session,
    userProfile,
    role,
    tenantId,
    isLoading,
    setSession,
    setUserProfile,
    setLoading,
    reset,
  } = useAuthStore()

  // Effect 1: Listen to auth state changes (sync only — no await)
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (!s) setLoading(false)
    })

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        // IMPORTANT: only set session state here, NO async work
        setSession(s)
        if (!s) reset()
      },
    )

    return () => subscription.unsubscribe()
  }, [setSession, setLoading, reset])

  // Effect 2: When session changes, load the user profile
  useEffect(() => {
    if (!session?.user) return

    let cancelled = false
    const userId = session.user.id

    async function loadProfile() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single()

        if (cancelled) return

        if (error) {
          console.error('[Auth] Profile error:', error.message)
          setUserProfile(null)
          setLoading(false)
          return
        }

        const profile = data as User

        if (profile.status === 'inactive') {
          await supabase.auth.signOut()
          reset()
          return
        }

        setUserProfile(profile)
        setLoading(false)
      } catch (err) {
        console.error('[Auth] Profile exception:', err)
        if (!cancelled) {
          setUserProfile(null)
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => { cancelled = true }
  }, [session?.user?.id, setUserProfile, setLoading, reset])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Email ou mot de passe incorrect')
      }
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    reset()
  }, [reset])

  return {
    user: session?.user ?? null,
    userProfile,
    role,
    tenantId,
    isLoading,
    isAuthenticated: !!session,
    signIn,
    signOut,
  }
}
