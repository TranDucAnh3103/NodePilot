import React from 'react'
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
} from 'lucide-react'
import { HostSnapshot } from '../types'
import { CpuChart } from '../components/CpuChart'
import { NetworkChart } from '../components/NetworkChart'
import { spring, transition } from '../lib/motion'

interface OverviewViewProps {
  snapshot: HostSnapshot | null
  cpuHistory: Array<{ time: string; value: number }>
  netHistory: Array<{ time: string; rxKB: number; txKB: number }>
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  snapshot,
  cpuHistory,
  netHistory,
}) => {
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

  const { host, cpu, memory, disks, networks, temperature } = snapshot

  // Format bytes to GiB / MiB
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Format uptime seconds into human-readable string
  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d} ngày ${h} giờ ${m} phút`
    if (h > 0) return `${h} giờ ${m} phút`
    return `${m} phút`
  }

  const cpuPercent = cpu.usagePercent !== null ? cpu.usagePercent : 0
  const ramPercent = memory.totalBytes > 0 ? (memory.usedBytes / memory.totalBytes) * 100 : 0
  const swapPercent = memory.swapTotalBytes > 0 ? (memory.swapUsedBytes / memory.swapTotalBytes) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className="space-y-6"
    >
      {/* 1. Host Summary Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {host.hostname}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-normal">
                  {host.architecture}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {host.platform} • Kernel {host.kernelVersion}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-6 text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Thời gian hoạt động</span>
                <span className="font-semibold text-slate-200">{formatUptime(host.uptimeSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Thermometer className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Nhiệt độ CPU</span>
                <span className="font-semibold text-slate-200">
                  {temperature.supported && temperature.celsius !== null
                    ? `${temperature.celsius} °C`
                    : 'Không hỗ trợ cảm biến'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Bảo mật máy chủ</span>
                <span className="font-semibold text-teal-300">Allowlist Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              Load: {cpu.load1.toFixed(2)} • {cpu.load5.toFixed(2)} • {cpu.load15.toFixed(2)}
            </p>
          </div>
          <div className="mt-4">
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(cpuPercent, 100)}%` }}
                transition={spring.progress}
                className={`h-full ${
                  cpuPercent > 85 ? 'bg-rose-500' : cpuPercent > 60 ? 'bg-amber-400' : 'bg-indigo-500'
                }`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
              <span>{cpu.cores} Lõi vật lý</span>
              <span>100% Tối đa</span>
            </div>
          </div>
        </div>

        {/* RAM Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Bộ nhớ (RAM)</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {ramPercent.toFixed(1)}%
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              {formatBytes(memory.usedBytes)} / {formatBytes(memory.totalBytes)}
            </p>
          </div>
          <div className="mt-4">
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(ramPercent, 100)}%` }}
                transition={spring.progress}
                className={`h-full ${
                  ramPercent > 90 ? 'bg-rose-500' : ramPercent > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
              <span>Khả dụng: {formatBytes(memory.availableBytes)}</span>
              <span>Swap: {swapPercent.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Disk Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Ổ cứng chính (/)</span>
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            {disks.length > 0 ? (
              <>
                <div className="text-2xl font-bold font-mono text-slate-100">
                  {disks[0].usedPercent.toFixed(1)}%
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  {formatBytes(disks[0].usedBytes)} / {formatBytes(disks[0].totalBytes)}
                </p>
              </>
            ) : (
              <div className="text-sm text-slate-500">Đang quét ổ cứng...</div>
            )}
          </div>
          <div className="mt-4">
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${disks.length > 0 ? disks[0].usedPercent : 0}%` }}
                transition={spring.progress}
                className="h-full bg-amber-500"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
              <span>Trống: {disks.length > 0 ? formatBytes(disks[0].freeBytes) : '0 B'}</span>
              <span>{disks.length} Phân vùng</span>
            </div>
          </div>
        </div>

        {/* Network Throughput Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Lưu lượng mạng</span>
              <Network className="w-4 h-4 text-teal-400" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                  <ArrowDown className="w-3 h-3 text-teal-400" /> Nhận (RX)
                </span>
                <span className="text-base font-bold font-mono text-slate-200">
                  {formatBytes(networks.reduce((acc, n) => acc + n.rxBytesPerSec, 0))}/s
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                  <ArrowUp className="w-3 h-3 text-indigo-400" /> Gửi (TX)
                </span>
                <span className="text-base font-bold font-mono text-slate-200">
                  {formatBytes(networks.reduce((acc, n) => acc + n.txBytesPerSec, 0))}/s
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-slate-800/60 flex justify-between text-[10px] text-slate-400">
            <span>Giao diện hoạt động</span>
            <span className="font-mono text-slate-300">{networks.filter((n) => n.isUp).length} interfaces</span>
          </div>
        </div>
      </div>

      {/* 3. Live ECharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-200">Diễn biến tải CPU (Thời gian thực)</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Chu kỳ quét 3s
            </span>
          </div>
          <div className="h-56">
            <CpuChart history={cpuHistory} />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Network className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-bold text-slate-200">Băng thông mạng RX / TX</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
              KB/s
            </span>
          </div>
          <div className="h-56">
            <NetworkChart history={netHistory} />
          </div>
        </div>
      </div>

      {/* 4. Detailed Disk Mount Points & Network Interfaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Storage Mountpoints */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center space-x-2 mb-4">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-200">Phân vùng ổ đĩa</h3>
          </div>
          <div className="space-y-3">
            {disks.map((d) => (
              <div
                key={d.mountpoint}
                className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2"
              >
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-200">{d.mountpoint}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {d.fsType}
                    </span>
                  </div>
                  <span className="font-mono text-slate-400">
                    {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)} ({d.usedPercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(d.usedPercent, 100)}%` }}
                    className={`h-full ${
                      d.usedPercent > 90 ? 'bg-rose-500' : d.usedPercent > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Network Interfaces */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Network className="w-4 h-4 text-teal-400" />
            <h3 className="text-sm font-bold text-slate-200">Giao diện mạng</h3>
          </div>
          <div className="space-y-2.5">
            {networks.map((n) => (
              <div
                key={n.name}
                className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`w-2 h-2 rounded-full ${n.isUp ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'}`}
                  />
                  <div>
                    <span className="font-mono font-bold text-slate-200">{n.name}</span>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      Tổng: RX {formatBytes(n.rxBytes)} • TX {formatBytes(n.txBytes)}
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-slate-400">
                  <div className="text-teal-400">↓ {formatBytes(n.rxBytesPerSec)}/s</div>
                  <div className="text-indigo-400">↑ {formatBytes(n.txBytesPerSec)}/s</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
