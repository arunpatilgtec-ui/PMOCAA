'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'PLANNER'
  | 'PROJECT_LEAD'
  | 'WORKSTREAM_LEAD'
  | 'RESOURCE'
  | 'LEADERSHIP'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl: string | null
  mustChangePassword?: boolean
}

interface AuthState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        set({ user: null })
      },
    }),
    { name: 'pmo-auth' }
  )
)

export function canManageProjects(role: UserRole): boolean {
  return ['ADMIN', 'MANAGER', 'PLANNER'].includes(role)
}

export function canApproveChanges(role: UserRole): boolean {
  return ['ADMIN', 'MANAGER', 'PLANNER'].includes(role)
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'ADMIN'
}

export function canCreateProject(role: UserRole): boolean {
  return ['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(role)
}

export function isPlanner(role: UserRole): boolean {
  return ['ADMIN', 'PLANNER'].includes(role)
}

export function canAllocateResources(role: UserRole): boolean {
  return ['ADMIN', 'PLANNER'].includes(role)
}
