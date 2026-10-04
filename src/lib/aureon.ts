const API_URL = String(import.meta.env.VITE_AUREON_API_URL || 'https://aureon-base-production.up.railway.app').replace(/\/$/, '')
export const PROJECT_SLUG = 'conexao-ela'

const ACCESS_KEY = 'conexao_ela_access_token'
const REFRESH_KEY = 'conexao_ela_refresh_token'

export type ProjectRole = 'owner' | 'admin' | 'member'

export type AureonUser = {
  id: string
  email: string
  is_superadmin?: boolean
  project_role?: ProjectRole
}

export type ApprovalRequest = {
  user_id: string
  email: string
  display_name: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at?: string
}

type ProjectAccessResponse = {
  project?: { slug?: string; name?: string; role?: ProjectRole }
  subscription?: Record<string, unknown> | null
  approval?: { status?: 'none' | 'pending' | 'approved' | 'rejected'; display_name?: string }
  access?: { allowed?: boolean; status?: string; reason?: string | null }
}

export type GoogleAuthConfig = {
  enabled: boolean
  client_id: string | null
}

type AureonRecord<T extends Record<string, unknown>> = {
  id: string
  data: T
  owner_user_id?: string | null
  created_at?: string
  updated_at?: string
}

type StorageObject = {
  id: string
  bucket: string
  object_key: string
  owner_user_id: string
  content_type: string
  size_bytes: number
  visibility: 'private' | 'project' | 'public'
  content_base64?: string
}

type RequestOptions = RequestInit & { retry?: boolean }

export function isValidNewPassword(password: string) {
  return password.length >= 6 && password.length <= 128
}

export function isProjectAdminRole(role: ProjectRole | undefined) {
  return role === 'admin' || role === 'owner'
}

export function buildRegistrationPayload(email: string, password: string, displayName = '') {
  return {
    email: email.trim().toLowerCase(),
    password,
    display_name: displayName.trim(),
    project_slug: PROJECT_SLUG,
  }
}

export function flattenRecord<T extends Record<string, unknown>>(record: AureonRecord<T>): T & { id: string; created_at?: string; updated_at?: string } {
  return {
    id: record.id,
    ...record.data,
    ...(record.created_at ? { created_at: record.created_at } : {}),
    ...(record.updated_at ? { updated_at: record.updated_at } : {}),
  }
}

function readToken(key: string) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function writeToken(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {}
}

let accessToken = readToken(ACCESS_KEY)
let refreshToken = readToken(REFRESH_KEY)

function persistTokens(data: { access_token?: string; refresh_token?: string }) {
  if (data.access_token) {
    accessToken = data.access_token
    writeToken(ACCESS_KEY, accessToken)
  }
  if (data.refresh_token) {
    refreshToken = data.refresh_token
    writeToken(REFRESH_KEY, refreshToken)
  }
}

function clearTokens() {
  accessToken = ''
  refreshToken = ''
  writeToken(ACCESS_KEY, '')
  writeToken(REFRESH_KEY, '')
}

async function raw(path: string, options: RequestInit = {}, token = accessToken) {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_URL}${path}`, { ...options, headers })
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retry = true, ...fetchOptions } = options
  let response = await raw(path, fetchOptions)

  if (response.status === 401 && retry && refreshToken && path !== '/auth/refresh') {
    const refreshed = await raw('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, '')

    if (refreshed.ok) {
      persistTokens(await refreshed.json())
      response = await raw(path, fetchOptions)
    } else {
      clearTokens()
    }
  }

  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`) as Error & { status?: number; code?: string }
    error.status = response.status
    error.code = data?.error
    throw error
  }
  return data as T
}

function codedError(code: string) {
  const error = new Error(code) as Error & { code?: string }
  error.code = code
  return error
}

function userWithProjectRole(user: AureonUser, payload: ProjectAccessResponse) {
  return {
    ...user,
    ...(payload.project?.role ? { project_role: payload.project.role } : {}),
  }
}

function approvalCode(payload: ProjectAccessResponse) {
  if (payload.approval?.status === 'rejected' || payload.access?.status === 'rejected') return 'approval_rejected'
  if (payload.approval?.status === 'pending' || payload.access?.status === 'pending_approval') return 'approval_pending'
  return ''
}

async function joinPublicProject() {
  return request<ProjectAccessResponse>(`/projects/${PROJECT_SLUG}/join`, {
    method: 'POST',
    retry: false,
  })
}

async function assertProjectAccess(user: AureonUser, options: { joinIfPublic?: boolean } = {}) {
  const check = async () => request<ProjectAccessResponse>(`/projects/${PROJECT_SLUG}/access`)
  try {
    const access = await check()
    if (access?.access?.allowed) return userWithProjectRole(user, access)
  } catch (error) {
    const code = (error as Error & { code?: string }).code
    const status = (error as Error & { status?: number }).status
    if (code === 'approval_pending' || code === 'approval_rejected') {
      clearTokens()
      throw error
    }

    if (options.joinIfPublic && (status === 402 || status === 403)) {
      try {
        const joined = await joinPublicProject()
        const joinedApproval = approvalCode(joined)
        if (joinedApproval) {
          clearTokens()
          throw codedError(joinedApproval)
        }
        if (joined?.access?.allowed) {
          const checked = await check()
          if (checked?.access?.allowed) return userWithProjectRole(user, checked)
        }
      } catch (joinError) {
        const joinCode = (joinError as Error & { code?: string }).code
        if (joinCode === 'approval_pending' || joinCode === 'approval_rejected') {
          clearTokens()
          throw joinError
        }
        throw joinError
      }
    }
  }
  clearTokens()
  throw codedError('project_access_denied')
}

async function listRecords<T extends Record<string, unknown>>(collection: string, limit = 500) {
  const rows = await request<AureonRecord<T>[]>(`/v1/projects/${PROJECT_SLUG}/data/${encodeURIComponent(collection)}?environment=production&limit=${limit}`)
  return rows.map(flattenRecord)
}

async function createRecord<T extends Record<string, unknown>>(collection: string, data: T) {
  const row = await request<AureonRecord<T>>(`/v1/projects/${PROJECT_SLUG}/data/${encodeURIComponent(collection)}`, {
    method: 'POST',
    body: JSON.stringify({ environment: 'production', data }),
  })
  return flattenRecord(row)
}

async function updateRecord<T extends Record<string, unknown>>(collection: string, id: string, data: T) {
  const row = await request<AureonRecord<T>>(`/v1/projects/${PROJECT_SLUG}/data/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ environment: 'production', data }),
  })
  return flattenRecord(row)
}

function storagePath(bucket: string, key: string) {
  const safeBucket = encodeURIComponent(bucket)
  const safeKey = key.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `/v1/projects/${PROJECT_SLUG}/storage/${safeBucket}/${safeKey}`
}

export const aureon = {
  auth: {
    async login(email: string, password: string) {
      const data = await request<{ user: AureonUser; access_token: string; refresh_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        retry: false,
      })
      persistTokens(data)
      return assertProjectAccess(data.user, { joinIfPublic: true })
    },
    async register(email: string, password: string, displayName = '') {
      const data = await request<{ user: AureonUser; access_token: string; refresh_token: string; approval?: { status?: string }; access?: { status?: string } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(buildRegistrationPayload(email, password, displayName)),
        retry: false,
      })
      persistTokens(data)
      if (data.approval?.status === 'pending' || data.access?.status === 'pending_approval') {
        clearTokens()
        throw codedError('approval_pending')
      }
      return assertProjectAccess(data.user)
    },
    async getGoogleConfig() {
      return request<GoogleAuthConfig>('/auth/google/config', { retry: false })
    },
    async loginWithGoogle(credential: string) {
      const data = await request<{ user: AureonUser; access_token: string; refresh_token: string }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, project_slug: PROJECT_SLUG }),
        retry: false,
      })
      persistTokens(data)
      return assertProjectAccess(data.user)
    },
    async restore() {
      if (!accessToken && !refreshToken) return null
      try {
        const user = await request<AureonUser>('/me')
        return await assertProjectAccess(user)
      } catch {
        clearTokens()
        return null
      }
    },
    async logout() {
      try {
        if (accessToken) {
          await request<void>('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken }),
            retry: false,
          })
        }
      } finally {
        clearTokens()
      }
    },
    async changePassword(currentPassword: string, newPassword: string) {
      if (!isValidNewPassword(newPassword) || !currentPassword || currentPassword === newPassword) throw new Error('invalid_new_password')
      await request<void>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        retry: false,
      })
      clearTokens()
    },
    async requestPasswordReset(email: string) {
      await request<{ ok: true }>('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        retry: false,
      })
    },
    async resetPassword(email: string, token: string, newPassword: string) {
      if (!isValidNewPassword(newPassword)) throw new Error('invalid_new_password')
      await request<void>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), token: token.trim(), new_password: newPassword }),
        retry: false,
      })
      clearTokens()
    },
    isAuthenticated() {
      return Boolean(accessToken || refreshToken)
    },
  },
  admin: {
    async listAccessRequests(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
      return request<ApprovalRequest[]>(`/projects/${PROJECT_SLUG}/admin/access-requests?status=${encodeURIComponent(status)}`)
    },
    async approveAccess(userId: string) {
      return request<ProjectAccessResponse>(`/projects/${PROJECT_SLUG}/admin/access-requests/${encodeURIComponent(userId)}/approve`, {
        method: 'POST',
      })
    },
    async rejectAccess(userId: string) {
      return request<{ user_id: string; display_name: string; status: 'rejected' }>(`/projects/${PROJECT_SLUG}/admin/access-requests/${encodeURIComponent(userId)}/reject`, {
        method: 'POST',
      })
    },
  },
  data: {
    list: listRecords,
    create: createRecord,
    update: updateRecord,
    async remove(collection: string, id: string) {
      await request<void>(`/v1/projects/${PROJECT_SLUG}/data/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?environment=production`, {
        method: 'DELETE',
      })
    },
    async upsertByField<T extends Record<string, unknown>>(collection: string, field: string, value: unknown, data: T) {
      const rows = await listRecords<Record<string, unknown>>(collection)
      const found = rows.find((row) => row[field] === value)
      if (found) return updateRecord(collection, String(found.id), data)
      return createRecord(collection, data)
    },
  },
  storage: {
    async get(bucket: string, key: string) {
      return request<StorageObject>(storagePath(bucket, key))
    },
    async upload(bucket: string, key: string, contentBase64: string, contentType: string) {
      return request<StorageObject>(storagePath(bucket, key), {
        method: 'POST',
        body: JSON.stringify({ content_base64: contentBase64, content_type: contentType, visibility: 'private' }),
      })
    },
    async remove(bucket: string, key: string) {
      await request<void>(storagePath(bucket, key), { method: 'DELETE' })
    },
    async replace(bucket: string, key: string, contentBase64: string, contentType: string) {
      try { await request<void>(storagePath(bucket, key), { method: 'DELETE' }) } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status !== 404) throw error
      }
      return request<StorageObject>(storagePath(bucket, key), {
        method: 'POST',
        body: JSON.stringify({ content_base64: contentBase64, content_type: contentType, visibility: 'private' }),
      })
    },
  },
}
