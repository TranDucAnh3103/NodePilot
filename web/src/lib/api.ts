import { HostSnapshot, User, UpdateCheckResult, VersionInfo, TriggerResult } from '../types'

let inMemoryToken: string | null = null

export function setAccessToken(token: string | null) {
  inMemoryToken = token
}

export function getAccessToken(): string | null {
  return inMemoryToken
}

export async function login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || 'Đăng nhập không thành công')
  }

  setAccessToken(json.data.accessToken)
  return json.data
}

export async function refreshToken(): Promise<string> {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  const json = await res.json()
  if (!res.ok) {
    setAccessToken(null)
    throw new Error(json.error?.message || 'Phiên làm việc đã hết hạn')
  }

  setAccessToken(json.data.accessToken)
  return json.data.accessToken
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
  } finally {
    setAccessToken(null)
  }
}

export async function getMe(): Promise<User> {
  const res = await fetchWithAuth('/api/v1/me')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể lấy thông tin user')
  return json.data
}

export async function getSummary(): Promise<HostSnapshot> {
  const res = await fetchWithAuth('/api/v1/system/summary')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể lấy số liệu tổng quan')
  return json.data
}

export async function getHistory(): Promise<HostSnapshot[]> {
  const res = await fetchWithAuth('/api/v1/system/history')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể lấy lịch sử số liệu')
  return json.data || []
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = getAccessToken()
  const headers = new Headers(options.headers || {})

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res = await fetch(url, { ...options, headers })

  // Auto-refresh token if 401
  if (res.status === 401) {
    try {
      token = await refreshToken()
      headers.set('Authorization', `Bearer ${token}`)
      res = await fetch(url, { ...options, headers })
    } catch {
      // Re-authentication failed
      setAccessToken(null)
    }
  }

  return res
}

export async function getVersion(): Promise<VersionInfo> {
  const res = await fetchWithAuth('/api/v1/system/version')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể lấy thông tin phiên bản')
  return json.data
}

export async function checkUpdate(): Promise<UpdateCheckResult> {
  const res = await fetchWithAuth('/api/v1/system/update/check')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Kiểm tra bản cập nhật thất bại')
  return json.data
}

export async function triggerUpdate(): Promise<TriggerResult> {
  const res = await fetchWithAuth('/api/v1/system/update/trigger', {
    method: 'POST',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Kích hoạt cập nhật Watchtower thất bại')
  return json.data
}
