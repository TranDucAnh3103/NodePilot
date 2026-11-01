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
