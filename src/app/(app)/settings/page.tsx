'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()

  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)

  const mismatch = newPwd && confirmPwd && newPwd !== confirmPwd
  const tooShort = newPwd.length > 0 && newPwd.length < 6
  const canSubmit = currentPwd.length > 0 && newPwd.length >= 6 && newPwd === confirmPwd && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDone(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      // Clear the force-change flag from the local store so banner disappears
      if (user) setUser({ ...user, mustChangePassword: false })
      toast.success('Password changed successfully')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account preferences</p>
      </div>

      {user?.mustChangePassword && (
        <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm text-orange-700 dark:text-orange-300">
          An administrator has reset your password. You must set a new password before you can continue using the app.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-blue-500" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center py-6 gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium">Password changed successfully</p>
              <p className="text-sm text-muted-foreground">Your new password is active.</p>
              <Button variant="outline" size="sm" onClick={() => setDone(false)}>Change again</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Current Password *</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    placeholder="Your current password"
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    className="pr-9"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowCurrent(s => !s)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>New Password *</Label>
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    className="pr-9"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowNew(s => !s)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {tooShort && <p className="text-red-500 text-xs">Password must be at least 6 characters</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Confirm New Password *</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    className="pr-9"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowConfirm(s => !s)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mismatch && <p className="text-red-500 text-xs">Passwords do not match</p>}
              </div>

              <Button type="submit" disabled={!canSubmit} className="w-full">
                {saving ? 'Saving…' : 'Change Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
