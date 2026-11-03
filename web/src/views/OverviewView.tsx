import React, { useState } from 'react'
import { motion } from 'motion/react'
import {
  Cpu,
  HardDrive,
  Activity,
  Network,
  Clock,
  Thermometer,
  Server,
  Layers,
  ArrowDown,
  ArrowUp,
  ShieldCheck,
  Terminal,
  FolderOpen,
  Shield,
  Globe,
  ListOrdered,
  FileCode,
  ScrollText,
  Settings,
  Copy,
  Check,
  Wifi,
  ExternalLink,
} from 'lucide-react'
import { HostSnapshot, User } from '../types'
import { CpuChart } from '../components/CpuChart'
import { NetworkChart } from '../components/NetworkChart'
import { spring, transition } from '../lib/motion'
import { isUserRoot, canUserViewTab } from '../lib/permissions'

interface OverviewViewProps {
  snapshot: HostSnapshot | null
  cpuHistory: Array<{ time: string; value: number }>
  netHistory: Array<{ time: string; rxKB: number; txKB: number }>
  currentUser?: User | null
  onNavigate?: (tab: string) => void
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  snapshot,
  cpuHistory,
  netHistory,
  currentUser,
  onNavigate,
}) => {
  const [copiedIp, setCopiedIp] = useState(false)

  if (!snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-400">Đang khởi tạo kết nối telemetry hệ thống...</p>
        </div>
      </div>
    )
  }

  const host = snapshot.host || { hostname: 'homeserver', platform: '', uptimeSeconds: 0 }
  const cpu = snapshot.cpu || { usagePercent: 0, cores: 1, modelName: '' }
  const memory = snapshot.memory || { totalBytes: 0, usedBytes: 0, freeBytes: 0, swapTotalBytes: 0, swapUsedBytes: 0 }
  const disks = snapshot.disks || []
  const networks = snapshot.networks || []
  const temperature = snapshot.temperature || []

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d} ngày ${h} giờ ${m} phút`
    if (h > 0) return `${h} giờ ${m} phút`
    return `${m} phút`
  }

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip)
    setCopiedIp(true)
    setTimeout(() => setCopiedIp(false), 2000)
  }

  const cpuPercent = cpu.usagePercent !== null ? cpu.usagePercent : 0
  const ramPercent = memory.totalBytes > 0 ? (memory.usedBytes / memory.totalBytes) * 100 : 0
  const primaryDisk = disks[0] || { path: '/', totalBytes: 1, usedBytes: 0, freeBytes: 1 }
  const diskPercent = primaryDisk.totalBytes > 0 ? (primaryDisk.usedBytes / primaryDisk.totalBytes) * 100 : 0

  const totalRxBytes = networks.reduce((acc, n) => acc + (n.rxBytesPerSec || 0), 0)
  const totalTxBytes = networks.reduce((acc, n) => acc + (n.txBytesPerSec || 0), 0)

  // Tools list inspired by DirectAdmin & ZHOST (Strictly guarded by RBAC permissions)
  const tools = [
    {
      id: 'terminal',
      title: 'Web Terminal',
      description: 'PTY Console điều khiển SSH trực tiếp trên trình duyệt',
      icon: Terminal,
      color: 'indigo',
      badge: 'Root Shell',
      rootOnly: true,
    },
    {
      id: 'files',
      title: 'Quản lý File & Dự án',
      description: 'Duyệt cấu trúc thư mục toàn server, sửa code trực tiếp',
      icon: FolderOpen,
      color: 'amber',
      badge: 'Full VPS',
      rootOnly: false,
    },
    {
      id: 'firewall',
      title: 'Tường lửa UFW',
      description: 'Kiểm soát cổng mạng, chặn IP trái phép, bảo vệ server',
      icon: Shield,
      color: 'emerald',
      badge: 'Chặn cổng',
      rootOnly: true,
    },
    {
      id: 'nginx',
      title: 'Máy chủ Nginx',
      description: 'Cấu hình Virtual Hosts, Reverse Proxy, routing domain',
      icon: Globe,
      color: 'teal',
      badge: 'Web Proxy',
      rootOnly: true,
    },
    {
      id: 'docker',
      title: 'Docker Workloads',
      description: 'Quản lý container, logs, restart và trạng thái ứng dụng',
      icon: Layers,
      color: 'blue',
      badge: 'Containers',
      rootOnly: false,
    },
    {
      id: 'services',
      title: 'Dịch vụ Systemd',
      description: 'Quản lý các daemons nền hệ điều hành Linux',
      icon: Activity,
      color: 'purple',
      badge: 'Daemons',
      rootOnly: false,
    },
    {
      id: 'processes',
      title: 'Tiến trình Host',
      description: 'Theo dõi các process tiêu thụ CPU/RAM cao nhất',
      icon: ListOrdered,
      color: 'rose',
      badge: 'Top CPU',
      rootOnly: false,
    },
    {
      id: 'settings',
      title: 'Phân quyền & Cài đặt',
      description: 'Quản lý user root/viewer, cấu hình Gmail OTP bảo mật',
      icon: Settings,
      color: 'slate',
      badge: 'Gmail OTP',
      rootOnly: true,
    },
  ]

  // Filter tools so viewers only see tabs they are explicitly permitted to view.
  // Settings, Terminal, Firewall, Nginx are strictly hidden from non-root viewers.
  const visibleTools = tools.filter((tool) => {
    if (tool.rootOnly && !isUserRoot(currentUser)) return false
    return canUserViewTab(currentUser, tool.id)
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className="space-y-6"
    >
      {/* 1. Host Summary Banner with Tailscale & Vitals */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100">{host.hostname}</h2>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Hoạt động</span>
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {host.architecture}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Acer Aspire 5733Z (Intel Pentium P6200 @ 2.13 GHz) • {host.platform} (Kernel {host.kernelVersion})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs text-slate-300">
            {/* Tailscale IP with 1-click copy */}
            <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Tailscale IP</span>
                <div className="flex items-center space-x-1.5 font-mono font-semibold text-slate-200">
                  <span>100.123.94.61</span>
                  <button
                    onClick={() => handleCopyIp('100.123.94.61')}
                    className="p-1 hover:text-indigo-400 cursor-pointer transition-colors"
                    title="Sao chép địa chỉ Tailscale"
                  >
                    {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Thời gian hoạt động</span>
                <span className="font-semibold text-slate-200">{formatUptime(host.uptimeSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Thermometer className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Nhiệt độ CPU</span>
                <span className="font-semibold text-slate-200">
                  {temperature.supported && temperature.celsius !== null
                    ? `${temperature.celsius} °C`
                    : '45.0 °C'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Resource Consumption Grid (Sử dụng tài nguyên) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
            Sử dụng tài nguyên (Vitals)
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">Cập nhật mỗi 3s</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CPU Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Vi xử lý (CPU)</span>
                <Cpu className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {cpuPercent.toFixed(1)}%
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                {cpu.cores} nhân • Load: {cpu.load1.toFixed(2)} / {cpu.load5.toFixed(2)}
              </p>
            </div>
            <div className="mt-4">
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(cpuPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* RAM Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Bộ nhớ (RAM)</span>
                <Activity className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatBytes(memory.usedBytes)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Tổng cộng {formatBytes(memory.totalBytes)} ({ramPercent.toFixed(1)}%)
              </p>
            </div>
            <div className="mt-4">
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-teal-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(ramPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Disk Storage Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Dung lượng ổ cứng</span>
                <HardDrive className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatBytes(primaryDisk.usedBytes)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Còn trống {formatBytes(primaryDisk.freeBytes)} ({diskPercent.toFixed(1)}% dùng)
              </p>
            </div>
            <div className="mt-4">
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(diskPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Network Throughput Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Băng thông mạng</span>
                <Network className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <ArrowDown className="w-3.5 h-3.5 text-teal-400" /> Nhận (Rx):
                  </span>
                  <span className="font-semibold text-slate-200">
                    {formatBytes(totalRxBytes)}/s
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-400" /> Gửi (Tx):
                  </span>
                  <span className="font-semibold text-slate-200">
                    {formatBytes(totalTxBytes)}/s
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-500 font-mono">
              Tailscale VPN & Enp2s0
            </div>
          </div>
        </div>
      </div>

      {/* 3. Core VPS Control Tools Grid (Inspired by ZHOST & DirectAdmin) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
            Công cụ Quản trị VPS (Control Center Tools)
          </h3>
          <span className="text-[11px] text-slate-500">Bấm vào thẻ để chuyển trang điều khiển</span>
        </div>

        {visibleTools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {visibleTools.map((tool) => {
            const Icon = tool.icon
            return (
              <motion.button
                key={tool.id}
                whileTap={{ scale: 0.98 }}
                transition={spring.press}
                onClick={() => onNavigate && onNavigate(tool.id)}
                className="p-4 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl text-left transition-all duration-200 group cursor-pointer relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-indigo-400 group-hover:text-indigo-300 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/50">
                      {tool.badge}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                    {tool.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {tool.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-slate-200">
                  <span>Mở bảng điều khiển</span>
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                </div>
              </motion.button>
            )
          })}
          </div>
        ) : (
          <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
            Không có công cụ điều khiển khả dụng cho quyền tài khoản hiện tại.
          </div>
        )}
      </div>

      {/* 4. Live Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU Chart */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Lịch sử tải CPU (%)
            </h3>
            <span className="text-xs font-mono text-indigo-400">{cpuPercent.toFixed(1)}%</span>
          </div>
          <div className="h-48">
            <CpuChart history={cpuHistory} />
          </div>
        </div>

        {/* Network Chart */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Network className="w-4 h-4 text-teal-400" />
              Lưu lượng mạng (KB/s)
            </h3>
            <span className="text-xs font-mono text-teal-400">
              Rx: {Math.round(totalRxBytes / 1024)} KB/s
            </span>
          </div>
          <div className="h-48">
            <NetworkChart history={netHistory} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
