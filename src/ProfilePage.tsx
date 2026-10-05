import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { aureon } from './lib/aureon'
import {
  applyTheme,
  compressProfileImage,
  createDiaryPinRecord,
  isDiaryPinValid,
  loadDiaryPinRecord,
  normalizeTheme,
  profileImageDataUrl,
  profileInitial,
  profilePhotoKey,
  saveDiaryPinRecord,
  verifyDiaryPin,
  type ProfileTheme,
} from './lib/profile'

type ProfileData = {
  profile_key: string
  display_name: string
  birthday: string | null
  bio: string | null
  theme: ProfileTheme
  photo_key: string | null
  photo_content_type: string | null
}

type Props = {
  userId: string
  email: string
  onLogout: () => Promise<void>
  onPasswordChanged: () => void
}

const EMPTY_PROFILE: ProfileData = {
  profile_key: 'main',
  display_name: 'Meu perfil',
  birthday: null,
  bio: null,
  theme: 'rose',
  photo_key: null,
  photo_content_type: null,
}

export function ProfilePage({ userId, email, onLogout, onPasswordChanged }: Props) {
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE)
  const [photoUrl, setPhotoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [lockEnabled, setLockEnabled] = useState(() => Boolean(loadDiaryPinRecord()))
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinMessage, setPinMessage] = useState('')
  const [pinError, setPinError] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const rows = await aureon.data.list<ProfileData>('profiles')
        if (!active) return
        const saved = rows.find((row) => row.profile_key === 'main')
        const next: ProfileData = saved ? {
          profile_key: 'main',
          display_name: String(saved.display_name || 'Meu perfil'),
          birthday: saved.birthday ? String(saved.birthday) : null,
          bio: saved.bio ? String(saved.bio) : null,
          theme: normalizeTheme(saved.theme),
          photo_key: saved.photo_key ? String(saved.photo_key) : null,
          photo_content_type: saved.photo_content_type ? String(saved.photo_content_type) : null,
        } : EMPTY_PROFILE
        setProfile(next)
        applyTheme(next.theme)
        if (next.photo_key) {
          try {
            const stored = await aureon.storage.get('profile', next.photo_key)
            if (active && stored.content_base64) setPhotoUrl(profileImageDataUrl(stored.content_type, stored.content_base64))
          } catch {
            if (active) setPhotoUrl('')
          }
        }
      } catch {
        if (active) setProfileError('Não foi possível carregar seu perfil agora.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [userId])

  function update<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  function chooseTheme(theme: ProfileTheme) {
    update('theme', theme)
    applyTheme(theme)
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setProfileError(''); setProfileMessage('')
    try {
      const next = { ...profile, display_name: profile.display_name.trim() || 'Meu perfil', bio: profile.bio?.trim() || null }
      await aureon.data.upsertByField<ProfileData>('profiles', 'profile_key', 'main', next)
      setProfile(next)
      setProfileMessage('Perfil salvo com carinho ✓')
    } catch {
      setProfileError('Não foi possível salvar o perfil.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true); setProfileError(''); setProfileMessage('')
    try {
      const prepared = await compressProfileImage(file)
      const key = profilePhotoKey(userId, 'jpeg')
      await aureon.storage.replace('profile', key, prepared.base64, prepared.contentType)
      const next = { ...profile, photo_key: key, photo_content_type: prepared.contentType }
      setProfile(next)
      setPhotoUrl(profileImageDataUrl(prepared.contentType, prepared.base64))
      await aureon.data.upsertByField<ProfileData>('profiles', 'profile_key', 'main', next)
      setProfileMessage('Foto de perfil atualizada ✓')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setProfileError(code === 'profile_image_too_large' ? 'Essa foto ficou grande demais. Tente outra imagem.' : 'Não foi possível salvar essa foto.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError(''); setPasswordMessage('')
    if (newPassword.length < 6) return setPasswordError('A nova senha precisa ter pelo menos 6 caracteres.')
    if (newPassword !== confirmPassword) return setPasswordError('As novas senhas não são iguais.')
    if (newPassword === currentPassword) return setPasswordError('Escolha uma senha diferente da atual.')
    setChangingPassword(true)
    try {
      await aureon.auth.changePassword(currentPassword, newPassword)
      setPasswordMessage('Senha alterada. Entre novamente com a nova senha.')
      onPasswordChanged()
    } catch {
      setPasswordError('A senha atual está incorreta ou não foi possível alterar agora.')
    } finally {
      setChangingPassword(false)
    }
  }

  async function enableDiaryLock(event: FormEvent) {
    event.preventDefault()
    setPinError(''); setPinMessage('')
    if (!isDiaryPinValid(pin)) return setPinError('Use um PIN de 4 a 6 números.')
    if (pin !== pinConfirm) return setPinError('Os PINs não são iguais.')
    setSavingPin(true)
    try {
      const record = await createDiaryPinRecord(pin)
      saveDiaryPinRecord(record)
      setLockEnabled(true); setPin(''); setPinConfirm('')
      setPinMessage('Diário protegido neste aparelho ✓')
    } catch {
      setPinError('Não foi possível ativar o bloqueio.')
    } finally {
      setSavingPin(false)
    }
  }

  async function disableDiaryLock(event: FormEvent) {
    event.preventDefault()
    setPinError(''); setPinMessage('')
    setSavingPin(true)
    try {
      const valid = await verifyDiaryPin(pin, loadDiaryPinRecord())
      if (!valid) return setPinError('PIN incorreto.')
      saveDiaryPinRecord(null)
      setLockEnabled(false); setPin(''); setPinConfirm('')
      setPinMessage('Bloqueio do Diário removido deste aparelho.')
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <div className="page-stack profile-page">
      <section className="profile-hero profile-hero-upgraded">
        <div className="profile-photo-wrap">
          {photoUrl ? <img className="profile-photo" src={photoUrl} alt="Foto de perfil" /> : <div className="avatar profile-avatar">{profileInitial(profile.display_name)}</div>}
          <label className="photo-edit-button">
            <span>{uploading ? '…' : '📷'}</span>
            <input type="file" accept="image/*" capture="user" onChange={(event) => void uploadPhoto(event)} disabled={uploading} />
          </label>
        </div>
        <div><span className="card-kicker">Conexão Ela</span><h1>{profile.display_name || 'Meu perfil'}</h1><p>{email}</p><small>Seu perfil, do seu jeito.</small></div>
      </section>

      {loading ? <section className="card"><p className="muted">Carregando seu perfil…</p></section> : (
        <form className="card form-stack profile-form" onSubmit={saveProfile}>
          <div className="section-heading"><div><span className="card-kicker">Meu perfil</span><h2>Sobre mim</h2></div><span className="soft-tag">Privado</span></div>
          <div className="two-columns">
            <label className="field"><span>Nome</span><input value={profile.display_name} onChange={(e) => update('display_name', e.target.value)} maxLength={80} /></label>
            <label className="field"><span>Aniversário</span><input type="date" value={profile.birthday || ''} onChange={(e) => update('birthday', e.target.value || null)} /></label>
          </div>
          <label className="field"><span>Uma frase sobre mim</span><textarea rows={3} value={profile.bio || ''} onChange={(e) => update('bio', e.target.value || null)} maxLength={280} placeholder="O que você quer lembrar sobre você nesta fase?" /></label>
          <div className="theme-picker">
            <span>Meu estilo</span>
            <div className="theme-options">
              <button type="button" className={profile.theme === 'rose' ? 'theme-option active' : 'theme-option'} onClick={() => chooseTheme('rose')}><i className="theme-swatch rose" />Rosé</button>
              <button type="button" className={profile.theme === 'light' ? 'theme-option active' : 'theme-option'} onClick={() => chooseTheme('light')}><i className="theme-swatch light" />Rosa Claro</button>
              <button type="button" className={profile.theme === 'night' ? 'theme-option active' : 'theme-option'} onClick={() => chooseTheme('night')}><i className="theme-swatch night" />Rosa Noturno</button>
            </div>
          </div>
          {profileError && <div className="form-message error">{profileError}</div>}
          {profileMessage && <div className="form-message success">{profileMessage}</div>}
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar meu perfil'}</button>
        </form>
      )}

      <section className="card security-card">
        <div className="section-heading"><div><span className="card-kicker">Privacidade</span><h2>Bloquear meu Diário</h2></div><span className={lockEnabled ? 'security-status enabled' : 'security-status'}>{lockEnabled ? 'Ativo' : 'Desativado'}</span></div>
        <p className="muted">Adicione um PIN de 4 a 6 números para abrir a aba Diário neste aparelho. Sua senha da conta continua sendo a proteção principal.</p>
        {!lockEnabled ? (
          <form className="form-stack compact-stack" onSubmit={enableDiaryLock}>
            <div className="two-columns">
              <label className="field"><span>Novo PIN</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
              <label className="field"><span>Confirmar PIN</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            </div>
            <button className="secondary-button" disabled={savingPin}>Ativar bloqueio do Diário</button>
          </form>
        ) : (
          <form className="inline-security-form" onSubmit={disableDiaryLock}>
            <label className="field"><span>PIN atual</span><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <button className="secondary-button danger-outline" disabled={savingPin}>Remover bloqueio</button>
          </form>
        )}
        {pinError && <div className="form-message error">{pinError}</div>}
        {pinMessage && <div className="form-message success">{pinMessage}</div>}
      </section>

      <section className="card security-card">
        <div className="section-heading"><div><span className="card-kicker">Segurança da conta</span><h2>Alterar minha senha</h2></div><span className="security-icon">🔐</span></div>
        <form className="form-stack compact-stack" onSubmit={changePassword}>
          <label className="field"><span>Senha atual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
          <div className="two-columns">
            <label className="field"><span>Nova senha</span><input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label>
            <label className="field"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label>
          </div>
          {passwordError && <div className="form-message error">{passwordError}</div>}
          {passwordMessage && <div className="form-message success">{passwordMessage}</div>}
          <button className="secondary-button" disabled={changingPassword}>{changingPassword ? 'Alterando…' : 'Alterar minha senha'}</button>
        </form>
      </section>

      <section className="card account-actions-card">
        <div><span className="card-kicker">Minha conta</span><h2>Encerrar acesso neste aparelho</h2><p className="muted">Ao sair, seus registros continuam guardados com segurança.</p></div>
        <button className="secondary-button danger logout-button" onClick={() => void onLogout()}>Sair da conta</button>
      </section>
    </div>
  )
}
