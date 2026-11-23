import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi, clearSession, getStoredUser, storeAuthResult, type AuthResult, type AuthUser } from './api'

export type User = AuthUser

const PERMISSION_ALIASES: Record<string, string> = {
  'employees.manage_status': 'employees.change_status',
  'roles.assign': 'roles.manage',
  'users.invite': 'users.manage',
}

type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, tenantName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser())

  const applyResult = useCallback((result: AuthResult) => {
    storeAuthResult(result)
    setUser(result.user)
  }, [])

  useEffect(() => {
    if (!getStoredUser()) return
    authApi.me()
      .then((current) => {
        setUser((previous) => (previous ? { ...previous, ...current } : current))
      })
      .catch(() => {
        clearSession()
        setUser(null)
      })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: !!user,
    async login(email: string, password: string) {
      applyResult(await authApi.login(email, password))
    },
    async register(name: string, tenantName: string, email: string, password: string) {
      applyResult(await authApi.register(name, tenantName, email, password))
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        clearSession()
        setUser(null)
      }
    },
    hasPermission(permission: string) {
      const canonical = PERMISSION_ALIASES[permission] ?? permission
      return !!user?.permissions.includes(canonical)
    },
  }), [user, applyResult])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
