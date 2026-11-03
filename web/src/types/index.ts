export type UserRole = 'root' | 'admin' | 'user' | 'operator' | 'viewer' | 'view'

export interface UserPermissions {
  viewTabs: string[]
  editTabs: string[]
  allowedPaths?: string[]
}

export interface User {
  id: string
  username: string
  role: UserRole
  permissions?: UserPermissions
  enabled?: boolean
  createdAt?: string
}

export interface SMTPConfig {
  host: string
  port: number
  username: string
  password?: string
  fromName: string
  appName: string
  hasPass?: boolean
}

export interface HostInfo {
  hostname: string
  os: string
  platform: string
  kernelVersion: string
  architecture: string
  uptimeSeconds: number
  bootTime: number
}

export interface CPUMetrics {
  usagePercent: number | null
  cores: number
  load1: number
  load5: number
  load15: number
  perCoreUsage?: number[]
}

export interface MemoryMetrics {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPercent: number
  cachedBytes: number
  buffersBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
  swapUsedPercent: number
}

export interface DiskPartition {
  device: string
  mountpoint: string
  fsType: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  usedPercent: number
}

export interface NetworkInterface {
  name: string
  isUp: boolean
  rxBytes: number
  txBytes: number
  rxBytesPerSec: number
  txBytesPerSec: number
}

export interface TemperatureInfo {
  supported: boolean
  celsius: number | null
}

export interface HostSnapshot {
  capturedAt: string
  host: HostInfo
  cpu: CPUMetrics
  memory: MemoryMetrics
  disks: DiskPartition[]
  networks: NetworkInterface[]
  temperature: TemperatureInfo
  stale?: boolean
}

export interface VersionInfo {
  currentVersion: string
  currentCommit: string
  repository: string
  goVersion: string
  buildTime: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  currentCommit: string
  latestVersion: string
  latestCommit: string
  commitMessage: string
  author: string
  publishedAt: string
  releaseNotes?: string
  repository: string
  updateMethod: string
}

export interface TriggerResult {
  status: string
  message: string
  triggeredAt: string
}

export interface PortMapping {
  ip?: string
  privatePort: number
  publicPort?: number
  type: string
}

export interface Container {
  id: string
  name: string
  image: string
  state: 'running' | 'exited' | 'paused' | 'restarting' | string
  status: string
  healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none' | string
  project: string
  ports: PortMapping[]
  cpuPercent: number
  memoryUsageBytes: number
  memoryLimitBytes: number
  restartCount: number
  created: string
  isAllowlisted: boolean
  isProtected: boolean
  allowedActions: string[]
}

export interface ServiceUnit {
  name: string
  description: string
  loadState: string
  activeState: 'active' | 'inactive' | 'failed' | string
  subState: string
  mainPid: number
  category: 'core_protected' | 'application' | 'system' | string
  isProtected: boolean
  isAllowlisted: boolean
  allowedActions: string[]
}

export interface AuditEvent {
  id: string
  timestamp: string
  actorId: string
  actorUsername: string
  verb: string
  target: string
  targetType: string
  targetId: string
  result: 'success' | 'denied' | 'failed' | string
  requestId: string
  ipAddress: string
  detailsRedactedJson?: string
}

export interface AuditQueryResponse {
  items: AuditEvent[]
  total: number
  page: number
  pageSize: number
}

// --- Sprint 3: Tasks, Files, Processes, Alerts & Power ---

export interface TaskPreset {
  id: string
  name: string
  description: string
  category: 'maintenance' | 'backup' | 'diagnostics' | string
  timeout: number
  allowedRoles: string[]
  dangerLevel: 'safe' | 'moderate' | 'high'
  confirmationMsg?: string
}

export interface TaskExecution {
  id: string
  presetId: string
  presetName?: string
  actorId: string
  actorUsername: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
  output: string
  exitCode: number
  startedAt: string
  completedAt?: string
  errorMessage?: string
}

export interface Bookmark {
  name: string
  path: string
  icon: string
}

export interface FileItem {
  name: string
  relPath: string
  isDir: boolean
  size: number
  modTime: string
  mode?: string
  owner?: string
  extension?: string
}

export interface FileContent {
  name?: string
  relPath: string
  content: string
  sha256: string
  size: number
  modTime?: string
  isEditable?: boolean
}

export interface FirewallRule {
  number: number
  to: string
  action: string
  from: string
  proto?: string
  protocol?: string
  comment?: string
}

export interface FirewallStatus {
  active: boolean
  defaultIn?: string
  defaultOut?: string
  defaultIncoming?: string
  defaultOutgoing?: string
  defaultRouted?: string
  rules: FirewallRule[]
  rawOutput?: string
}

export interface NginxSite {
  name: string
  enabled: boolean
  modTime: string
  size: number
  serverName?: string
  listenPort?: string
}

export interface NginxStatus {
  installed: boolean
  active: boolean
  version: string
  sites: NginxSite[]
}

export interface TailscalePeer {
  ip: string
  hostname: string
  user: string
  os: string
  status: string
}

export interface TailscaleInfo {
  connected: boolean
  ip: string
  hostname: string
  peers: TailscalePeer[]
  activePeers: number
  rawStatus?: string
}

export interface ProcessInfo {
  pid: number
  name: string
  username: string
  category: 'wavelink' | 'docker' | 'web' | 'database' | 'network' | 'hscc' | 'system' | string
  cpuPercent: number
  memoryBytes: number
  memoryPercent: number
  status: string
  commandLine: string
}

export interface Alert {
  id: string
  key: string
  kind: 'cpu' | 'memory' | 'disk' | 'container' | string
  severity: 'warning' | 'critical'
  title: string
  message: string
  value: number
  threshold: number
  triggeredAt: string
  resolvedAt?: string
  active: boolean
}

export interface PowerStatus {
  mode: 'active' | 'idle' | 'hibernate'
  subscribers: number
  activeIntervalSeconds: number
  idleIntervalSeconds: number
  lastCollectedAt: string
  collectCount: number
}

export interface MetricSeries {
  metric: string
  scope: string
  unit: string
  stepSeconds: number
  points: Array<{ ts: string; value: number }>
}
