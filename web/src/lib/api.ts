import {
  HostSnapshot,
  User,
  UpdateCheckResult,
  VersionInfo,
  TriggerResult,
  Container,
  ServiceUnit,
  AuditEvent,
  AuditQueryResponse,
  TaskPreset,
  TaskExecution,
  FileItem,
  FileContent,
  ProcessInfo,
  Alert,
  PowerStatus,
  MetricSeries,
} from '../types'

export const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) ||
  ''
).replace(/\/$/, '')

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

let inMemoryToken: string | null = null

export function setAccessToken(token: string | null) {
  inMemoryToken = token
}

export function getAccessToken(): string | null {
  return inMemoryToken
}

export async function login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
  const res = await fetch(buildApiUrl('/api/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || 'Đăng nhập không thành công')
  }

  setAccessToken(json.data.accessToken)
  return json.data
}

export async function sendOTP(email: string): Promise<{ sent: boolean; message: string; code?: string }> {
  const res = await fetch(buildApiUrl('/api/v1/auth/otp/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || 'Không thể gửi mã OTP')
  }
  return json.data
}

export async function verifyOTP(email: string, code: string): Promise<{ accessToken: string; user: User }> {
  const res = await fetch(buildApiUrl('/api/v1/auth/otp/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, code }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || 'Mã OTP không hợp lệ')
  }

  setAccessToken(json.data.accessToken)
  return json.data
}

export async function refreshToken(): Promise<string> {
  const res = await fetch(buildApiUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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
    await fetch(buildApiUrl('/api/v1/auth/logout'), {
      method: 'POST',
      credentials: 'include',
    })
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

  const fullUrl = buildApiUrl(url)
  const reqOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  }

  let res = await fetch(fullUrl, reqOptions)

  // Auto-refresh token if 401
  if (res.status === 401) {
    try {
      token = await refreshToken()
      headers.set('Authorization', `Bearer ${token}`)
      res = await fetch(fullUrl, { ...reqOptions, headers })
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

// --- Sprint 2: Workloads & Audit Endpoints ---

export async function getContainers(): Promise<Container[]> {
  const res = await fetchWithAuth('/api/v1/workloads/docker')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải danh sách containers')
  return json.data || []
}

export async function getContainerLogs(id: string, tail: number = 200): Promise<string> {
  const res = await fetchWithAuth(`/api/v1/workloads/docker/${encodeURIComponent(id)}/logs?tail=${tail}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải logs container')
  return json.data?.logs || ''
}

export async function executeContainerAction(
  name: string,
  operation: 'start' | 'stop' | 'restart',
  reason: string,
  idempotencyKey: string,
  project?: string
): Promise<void> {
  const query = project ? `?project=${encodeURIComponent(project)}` : ''
  const res = await fetchWithAuth(`/api/v1/workloads/docker/${encodeURIComponent(name)}/action${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ operation, reason }),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || `Thao tác ${operation} thất bại`)
  }
}

export async function getServices(): Promise<ServiceUnit[]> {
  const res = await fetchWithAuth('/api/v1/workloads/systemd')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải danh sách systemd services')
  return json.data || []
}

export async function getServiceLogs(name: string, tail: number = 200): Promise<string> {
  const res = await fetchWithAuth(`/api/v1/workloads/systemd/${encodeURIComponent(name)}/logs?tail=${tail}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải logs service')
  return json.data?.logs || ''
}

export async function executeServiceAction(
  name: string,
  operation: 'start' | 'stop' | 'restart',
  reason: string,
  idempotencyKey: string
): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/workloads/systemd/${encodeURIComponent(name)}/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ operation, reason }),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || `Thao tác ${operation} thất bại`)
  }
}

export async function getAuditEvents(params?: {
  page?: number
  pageSize?: number
  keyword?: string
  result?: string
  verb?: string
}): Promise<AuditQueryResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', params.page.toString())
  if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString())
  if (params?.keyword) searchParams.set('keyword', params.keyword)
  if (params?.result) searchParams.set('result', params.result)
  if (params?.verb) searchParams.set('verb', params.verb)

  const res = await fetchWithAuth(`/api/v1/audit?${searchParams.toString()}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải nhật ký kiểm toán')
  return json.data
}

// --- Sprint 3: Tasks, Files, Processes, Alerts & Power APIs ---

export async function getTaskPresets(): Promise<TaskPreset[]> {
  const res = await fetchWithAuth('/api/v1/tasks/presets')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải danh mục tác vụ')
  return json.data || []
}

export async function getTaskExecutions(limit: number = 20): Promise<TaskExecution[]> {
  const res = await fetchWithAuth(`/api/v1/tasks/executions?limit=${limit}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải lịch sử chạy tác vụ')
  return json.data || []
}

export async function triggerTask(presetId: string): Promise<TaskExecution> {
  const res = await fetchWithAuth('/api/v1/tasks/executions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presetId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Kích hoạt tác vụ thất bại')
  return json.data
}

export async function cancelTask(id: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/tasks/executions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Hủy tác vụ thất bại')
}

export async function listFiles(path: string = '.'): Promise<FileItem[]> {
  const res = await fetchWithAuth(`/api/v1/files/list?path=${encodeURIComponent(path)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể duyệt thư mục')
  return json.data || []
}

export async function getFileContent(path: string): Promise<FileContent> {
  const res = await fetchWithAuth(`/api/v1/files/content?path=${encodeURIComponent(path)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể đọc nội dung file')
  return json.data
}

export async function saveFileContent(relPath: string, content: string, expectedSha256?: string): Promise<FileContent> {
  const res = await fetchWithAuth('/api/v1/files/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relPath, content, expectedSha256 }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Lưu file thất bại')
  return json.data
}

export async function getProcesses(sort: string = 'cpu', limit: number = 50): Promise<ProcessInfo[]> {
  const res = await fetchWithAuth(`/api/v1/system/processes?sort=${encodeURIComponent(sort)}&limit=${limit}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải danh sách tiến trình')
  return json.data || []
}

export async function getAlerts(): Promise<{ active: Alert[]; recent: Alert[] }> {
  try {
    const res = await fetchWithAuth('/api/v1/alerts')
    const json = await res.json()
    if (!res.ok) return { active: [], recent: [] }
    return {
      active: (json.data && json.data.active) || [],
      recent: (json.data && json.data.recent) || [],
    }
  } catch {
    return { active: [], recent: [] }
  }
}

export async function getPowerStatus(): Promise<PowerStatus> {
  const res = await fetchWithAuth('/api/v1/system/power-status')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể kiểm tra trạng thái nguồn')
  return json.data
}

export async function getHistorySeries(metric: string = 'cpu.usage', scope: string = 'host', duration: string = '24h'): Promise<MetricSeries> {
  const res = await fetchWithAuth(`/api/v1/system/history/series?metric=${encodeURIComponent(metric)}&scope=${encodeURIComponent(scope)}&duration=${encodeURIComponent(duration)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'Không thể tải chuỗi số liệu lịch sử')
  return json.data
}
