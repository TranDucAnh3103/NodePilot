export interface User {
  id: string
  username: string
  role: 'admin' | 'viewer'
  createdAt?: string
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
