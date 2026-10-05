import { FormEvent, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { aureon, isProjectAdminRole, type ApprovalRequest, type AureonUser } from './lib/aureon'
import { loadDiaryPinRecord, restoreTheme, verifyDiaryPin } from './lib/profile'
import { validateSignup, type SignupError } from './lib/signup'
import { saveSessionNotice, takeSessionNotice } from './lib/sessionNotice'
import { BeautyPage, DiaryPage, EvolutionPage, GoalsPage, HealthPage, TodayPage } from './pages'
import { ProfilePage } from './ProfilePage'
import { CommunityPage, CommunityChatPage } from './SocialPages'

const navigation = [
  ['/', '⌂', 'Hoje'],
  ['/comunidade', '♥', 'Comunidade'],
  ['/chat', '✉', 'Chat'],
  ['/metas', '◎', 'Metas'],
  ['/diario', '✎', 'Diário'],
  ['/saude', '♡', 'Saúde'],
  ['/beleza', '✦', 'Beleza'],
  ['/evolucao', '↗', 'Evolução'],
  ['/perfil', '◌', 'Perfil'],
] as const

function signupErrorMessage(error: SignupError) {
  const messages: Record<SignupError, string> = {
    name_required: 'Digite seu nome.',
    invalid_email: 'Digite um e-mail válido.',
    invalid_password: 'Sua senha precisa ter entre 6 e 128 caracteres.',
    password_mismatch: 'As senhas não são iguais.',
    terms_required: 'Aceite os termos e as regras da comunidade para continuar.',
  }
  return messages[error]
}

function AuthScreen({ onLogin }: { onLogin: (user: AureonUser, notice?: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setError('')
    setStatusMessage('')
    setPassword('')
    setConfirmPassword('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setStatusMessage('')
    try {
      if (mode === 'login') {
        const user = await aureon.auth.login(email, password)
        onLogin(user)
        return
      }

      const checked = validateSignup({ name, email, password, confirmPassword, acceptedTerms })
      if (!checked.valid) {
        setError(signupErrorMessage(checked.error))
        return
      }

      const user = await aureon.auth.register(email, password, name)
      let notice: string | undefined
      try {
        await aureon.data.upsertByField('profiles', 'profile_key', 'main', {
          profile_key: 'main',
          display_name: name.trim(),
          birthday: null,
          bio: null,
          theme: 'rose',
          photo_key: null,
          photo_content_type: null,
        })
      } catch {
        notice = 'Sua conta foi criada. Complete seu perfil quando quiser na aba Perfil.'
      }
      onLogin(user, notice)
    } catch (caught) {
      const code = (caught as Error & { code?: string }).code
      if (code === 'approval_pending') {
        setStatusMessage(mode === 'signup'
          ? 'Cadastro enviado com sucesso. Agora é só aguardar a aprovação da administração. Depois, volte em Entrar e use este mesmo e-mail e senha.'
          : 'Seu cadastro está aguardando aprovação da administração. Assim que ela aprovar, você entra com este mesmo e-mail e senha.')
      } else if (code === 'approval_rejected') {
        setError('Seu pedido de acesso não foi aprovado. Fale com a administração do Conexão Ela.')
      } else if (mode === 'signup' && code === 'email_already_exists') {
        setError('Este e-mail já possui uma conta. Entre com sua senha.')
      } else {
        setError(mode === 'login'
          ? 'Não foi possível entrar. Confira seu e-mail e sua senha.'
          : 'Não foi possível criar sua conta agora. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">CE</div>
        <span className="card-kicker">CONEXÃO ELA</span>
        <h1>{mode === 'login' ? 'Bem-vinda de volta.' : 'Seu espaço começa aqui.'}</h1>
        <p>Conecte-se, compartilhe e cresça junto com outras mulheres.</p>

        <div className="auth-mode-tabs" role="tablist" aria-label="Acesso">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Entrar</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Criar minha conta</button>
        </div>

        <form className="form-stack" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="field"><span>Nome</span><input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          )}
          <label className="field"><span>E-mail</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field"><span>Senha</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {mode === 'signup' && (
            <>
              <label className="field"><span>Confirmar senha</span><input type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
              <label className="terms-row"><input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} /><span>Li e aceito os termos e as regras da comunidade.</span></label>
            </>
          )}
          {statusMessage && <div className="form-message success">{statusMessage}</div>}
          {error && <div className="form-message error">{error}</div>}
          <button className="primary-button" disabled={loading}>{loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}</button>
        </form>

        <small className="auth-note">{mode === 'login' ? 'Ainda não tem conta? Crie gratuitamente.' : 'Cadastro gratuito e acesso permanente.'}</small>
      </section>
    </main>
  )
}

function LoadingScreen() {
  return <main className="loading-page"><div className="loading-mark">CE</div><p>Preparando seu espaço…</p></main>
}

function DiaryGate({ userId }: { userId: string }) {
  const [record] = useState(() => loadDiaryPinRecord())
  const [unlocked, setUnlocked] = useState(() => !record)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (!record) return setUnlocked(true)
    setChecking(true); setError('')
    try {
      if (await verifyDiaryPin(pin, record)) {
        setUnlocked(true)
        setPin('')
      } else {
        setError('PIN incorreto.')
      }
    } finally {
      setChecking(false)
    }
  }

  if (unlocked) return <DiaryPage userId={userId} />

  return (
    <div className="page-stack diary-lock-page">
      <section className="card diary-lock-card">
        <div className="lock-orb">🔒</div>
        <span className="card-kicker">Meu Diário</span>
        <h1>Um espaço só seu.</h1>
        <p>Digite seu PIN para abrir suas páginas.</p>
        <form className="form-stack" onSubmit={unlock}>
          <label className="field"><span>PIN do Diário</span><input type="password" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus required /></label>
          {error && <div className="form-message error">{error}</div>}
          <button className="primary-button" disabled={checking}>{checking ? 'Verificando…' : 'Abrir meu Diário'}</button>
        </form>
      </section>
    </div>
  )
}

function AdminPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actingUserId, setActingUserId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadRequests() {
    setLoading(true)
    setError('')
    try {
      setRequests(await aureon.admin.listAccessRequests('pending'))
    } catch {
      setError('Não foi possível carregar os pedidos de acesso.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRequests()
  }, [])

  async function decide(request: ApprovalRequest, action: 'approve' | 'reject') {
    setActingUserId(request.user_id)
    setError('')
    setMessage('')
    try {
      if (action === 'approve') {
        await aureon.admin.approveAccess(request.user_id)
        setMessage(`${request.display_name || request.email} foi aprovada e já pode entrar no Conexão Ela.`)
      } else {
        await aureon.admin.rejectAccess(request.user_id)
        setMessage(`O pedido de ${request.display_name || request.email} foi recusado.`)
      }
      setRequests((current) => current.filter((item) => item.user_id !== request.user_id))
    } catch {
      setError('Não foi possível concluir essa ação. Tente novamente.')
    } finally {
      setActingUserId('')
    }
  }

  return (
    <div className="page-stack admin-page">
      <section className="page-title">
        <span className="card-kicker">ADMINISTRADOR</span>
        <h1>Aprovação de novas usuárias</h1>
        <p>Somente você decide quem entra no Conexão Ela. O painel não mostra Diário, Metas ou outros conteúdos privados.</p>
      </section>

      <section className="card admin-summary">
        <div>
          <strong>{requests.length}</strong>
          <span>{requests.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'}</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadRequests()} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar lista'}
        </button>
      </section>

      {message && <div className="form-message success">{message}</div>}
      {error && <div className="form-message error">{error}</div>}

      <section className="admin-request-list">
        {loading ? (
          <div className="card admin-empty">Carregando pedidos…</div>
        ) : requests.length === 0 ? (
          <div className="card admin-empty">
            <strong>Nenhum pedido pendente.</strong>
            <span>Quando uma nova mulher criar a conta, ela aparecerá aqui para sua aprovação.</span>
          </div>
        ) : requests.map((request) => (
          <article className="card admin-request-card" key={request.user_id}>
            <div className="admin-request-identity">
              <div className="admin-request-avatar">{(request.display_name || request.email).trim().charAt(0).toUpperCase()}</div>
              <div>
                <h3>{request.display_name || 'Nova usuária'}</h3>
                <p>{request.email}</p>
                <small>Solicitou acesso em {new Date(request.created_at).toLocaleString('pt-BR')}</small>
              </div>
            </div>
            <div className="admin-request-actions">
              <button
                className="secondary-button admin-reject"
                type="button"
                disabled={actingUserId === request.user_id}
                onClick={() => void decide(request, 'reject')}
              >
                Recusar
              </button>
              <button
                className="primary-button compact"
                type="button"
                disabled={actingUserId === request.user_id}
                onClick={() => void decide(request, 'approve')}
              >
                {actingUserId === request.user_id ? 'Aguarde…' : 'Aprovar acesso'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

function AppShell({ user, onLogout, onPasswordChanged }: { user: AureonUser; onLogout: () => Promise<void>; onPasswordChanged: () => void }) {
  const [notice] = useState(() => takeSessionNotice())
  const admin = isProjectAdminRole(user.project_role)
  const navItems = admin ? [...navigation, ['/admin', '✓', 'Admin'] as const] : navigation
  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="mini-brand"><span>CE</span><div><strong>Conexão Ela</strong><small>Conexão, comunidade e cuidado</small></div></div>
        <div className="topbar-heart" aria-hidden="true">♥</div>
      </header>
      <main className="content-area">
        {notice && <div className="global-notice" role="status">{notice}</div>}
        <Routes>
          <Route path="/" element={<TodayPage userId={user.id} />} />
          <Route path="/comunidade" element={<CommunityPage userId={user.id} />} />
          <Route path="/chat" element={<CommunityChatPage userId={user.id} />} />
          <Route path="/metas" element={<GoalsPage userId={user.id} />} />
          <Route path="/diario" element={<DiaryGate userId={user.id} />} />
          <Route path="/saude" element={<HealthPage userId={user.id} />} />
          <Route path="/beleza" element={<BeautyPage userId={user.id} />} />
          <Route path="/evolucao" element={<EvolutionPage userId={user.id} />} />
          <Route path="/perfil" element={<ProfilePage userId={user.id} email={user.email} onLogout={onLogout} onPasswordChanged={onPasswordChanged} />} />
          <Route path="/admin" element={admin ? <AdminPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Menu principal" style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}>
        {navItems.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span>{icon}</span><small>{label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<AureonUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { restoreTheme() }, [])

  useEffect(() => {
    let mounted = true
    void aureon.auth.restore().then((restored) => {
      if (mounted) { setUser(restored); setLoading(false) }
    })
    return () => { mounted = false }
  }, [])

  async function logout() {
    await aureon.auth.logout()
    setUser(null)
  }

  if (loading) return <LoadingScreen />
  if (!user) return <AuthScreen onLogin={(nextUser, notice) => { if (notice) saveSessionNotice(notice); setUser(nextUser) }} />
  return <AppShell user={user} onLogout={logout} onPasswordChanged={() => setUser(null)} />
}
