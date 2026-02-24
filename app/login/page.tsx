'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, LogIn, UserPlus, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [accountDeleted, setAccountDeleted] = useState(false)

  useEffect(() => {
    if (searchParams.get('deleted') === 'true') {
      setAccountDeleted(true)
    }
  }, [searchParams])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (error) { setErrorMsg(error.message); return }
    setSuccessMsg('Cadastro realizado! Verifique seu e-mail para confirmar a conta, depois faca login.')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) { setErrorMsg('E-mail ou senha incorretos.'); return }
    router.push('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-black">
            {'R$'}
          </div>
          <h1 className="text-2xl font-bold text-foreground text-balance">
            The Rich Couple
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organize suas financas em workspaces para uso individual, casal ou familia.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                onClick={() => { setMode('signin'); setErrorMsg(null); setSuccessMsg(null) }}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-all',
                  mode === 'signin'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Entrar
              </button>
              <button
                onClick={() => { setMode('signup'); setErrorMsg(null); setSuccessMsg(null) }}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-all',
                  mode === 'signup'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Cadastrar
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>

              {accountDeleted && (
                <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm">
                  <ShieldCheck className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Conta excluida com sucesso</p>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                      Em conformidade com a LGPD (Art. 18, VI), todos os seus dados pessoais foram eliminados permanentemente.
                    </p>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {successMsg}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full h-11 text-base font-semibold">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === 'signin' ? (
                  <>
                    <LogIn className="h-4 w-4" />
                    Entrar
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Criar conta
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
