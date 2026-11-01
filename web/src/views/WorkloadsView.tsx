import React, { useState } from 'react'
import { motion } from 'motion/react'
import {
  Layers,
  Search,
  Play,
  Square,
  RotateCw,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { ConfirmModal } from '../components/ConfirmModal'

interface ContainerItem {
  id: string
  name: string
  image: string
  state: 'running' | 'exited' | 'restarting' | 'paused'
  statusText: string
  ports: string[]
  isAllowlisted: boolean
  isDenylisted: boolean
  cpuUsage: number
  memUsageMiB: number
}

// Initial mock state reflecting 100% host containers discovery
const INITIAL_CONTAINERS: ContainerItem[] = [
  {
    id: 'e4a9f3b10c82',
    name: 'homeserver-caddy-proxy',
    image: 'caddy:2.8.4-alpine',
    state: 'running',
    statusText: 'Up 18 days (healthy)',
    ports: ['0.0.0.0:80->80/tcp', '0.0.0.0:443->443/tcp'],
    isAllowlisted: false,
    isDenylisted: true, // System critical proxy - Protected
    cpuUsage: 0.4,
    memUsageMiB: 32.5,
  },
  {
    id: 'b1c8f9024a15',
    name: 'nodepilot-app-demo',
    image: 'nodepilot/demo:v1.2',
    state: 'running',
    statusText: 'Up 4 hours',
    ports: ['127.0.0.1:3000->3000/tcp'],
    isAllowlisted: true, // Allowlisted user workload
    isDenylisted: false,
    cpuUsage: 1.2,
    memUsageMiB: 110.8,
  },
  {
    id: '9df4e12055bc',
    name: 'grafana-monitoring',
    image: 'grafana/grafana:11.1.0',
    state: 'running',
    statusText: 'Up 6 days',
    ports: ['127.0.0.1:3001->3000/tcp'],
    isAllowlisted: true,
    isDenylisted: false,
    cpuUsage: 0.8,
    memUsageMiB: 85.2,
  },
  {
    id: '7a13c9550df1',
    name: 'legacy-backup-worker',
    image: 'homeserver/backup:2025.10',
    state: 'exited',
    statusText: 'Exited (0) 2 days ago',
    ports: [],
    isAllowlisted: true,
    isDenylisted: false,
    cpuUsage: 0.0,
    memUsageMiB: 0.0,
  },
  {
    id: '15d8a0c492ee',
    name: 'tailscale-subnet-router',
    image: 'tailscale/tailscale:v1.74.0',
    state: 'running',
    statusText: 'Up 21 days',
    ports: [],
    isAllowlisted: false,
    isDenylisted: true, // Network foundation - Protected
    cpuUsage: 0.2,
    memUsageMiB: 28.4,
  },
]

export const WorkloadsView: React.FC = () => {
  const [containers, setContainers] = useState<ContainerItem[]>(INITIAL_CONTAINERS)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'running' | 'allowlisted'>('all')

  // Confirmation modal state
  const [activeModal, setActiveModal] = useState<{
    target: ContainerItem
    action: 'start' | 'stop' | 'restart' | 'kill'
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Filter logic: 100% host containers are observable
  const filteredContainers = containers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.image.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false
    if (filterMode === 'running') return c.state === 'running'
    if (filterMode === 'allowlisted') return c.isAllowlisted
    return true
  })

  const handleActionClick = (container: ContainerItem, action: 'start' | 'stop' | 'restart' | 'kill') => {
    setActiveModal({ target: container, action })
  }

  const handleExecuteAction = async () => {
    if (!activeModal) return
    setIsProcessing(true)

    // Simulate action execution with idempotency key
    setTimeout(() => {
      setContainers((prev) =>
        prev.map((c) => {
          if (c.id === activeModal.target.id) {
            if (activeModal.action === 'stop' || activeModal.action === 'kill') {
              return { ...c, state: 'exited', statusText: 'Exited just now' }
            }
            if (activeModal.action === 'start' || activeModal.action === 'restart') {
              return { ...c, state: 'running', statusText: 'Up just now' }
            }
          }
          return c
        })
      )
      setIsProcessing(false)
      setActiveModal(null)
    }, 600)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Quan sát Docker Workloads</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quan sát 100% containers trên máy chủ. Quyền điều khiển được kiểm soát chặt chẽ bởi Guardrail Allowlist.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {containers.filter((c) => c.state === 'running').length} Đang chạy
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
            {containers.length} Tổng containers
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, ID, image..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Tất cả (100%)
          </button>
          <button
            onClick={() => setFilterMode('running')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'running'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Đang chạy
          </button>
          <button
            onClick={() => setFilterMode('allowlisted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'allowlisted'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Được phép điều khiển
          </button>
        </div>
      </div>

      {/* Workloads List */}
      <div className="space-y-3">
        {filteredContainers.map((container) => {
          const isRunning = container.state === 'running'
          return (
            <motion.div
              key={container.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.pop}
              className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl hover:border-slate-700/80 transition-all shadow-sm"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Container identity */}
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRunning ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                      }`}
                    />
                    <h3 className="font-mono font-bold text-sm text-slate-100">{container.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                      {container.id}
                    </span>

                    {/* Guardrail Policy Tag */}
                    {container.isDenylisted ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Denylist (Bảo vệ hệ thống)
                      </span>
                    ) : container.isAllowlisted ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Allowlist (Cho phép mutate)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                        Chỉ quan sát (Chưa gán quyền)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-0.5">
                    <span className="font-mono text-slate-400">Image: {container.image}</span>
                    <span className="text-slate-500">•</span>
                    <span className="font-mono">{container.statusText}</span>
                    {container.ports.length > 0 && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="font-mono text-indigo-400">{container.ports.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Telemetry and Action Controls */}
                <div className="flex items-center space-x-4 self-end lg:self-center">
                  {isRunning && (
                    <div className="text-right font-mono text-xs text-slate-400 hidden sm:block">
                      <div>CPU: {container.cpuUsage.toFixed(1)}%</div>
                      <div>RAM: {container.memUsageMiB.toFixed(1)} MiB</div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1.5">
                    {container.isAllowlisted ? (
                      <>
                        {isRunning ? (
                          <>
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              transition={spring.press}
                              onClick={() => handleActionClick(container, 'restart')}
                              className="p-2 text-slate-300 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Khởi động lại (Restart)"
                            >
                              <RotateCw className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              transition={spring.press}
                              onClick={() => handleActionClick(container, 'stop')}
                              className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Dừng (Stop)"
                            >
                              <Square className="w-4 h-4" />
                            </motion.button>
                          </>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            transition={spring.press}
                            onClick={() => handleActionClick(container, 'start')}
                            className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                            title="Khởi chạy (Start)"
                          >
                            <Play className="w-4 h-4" />
                          </motion.button>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                        Thao tác bị khóa bởi chính sách
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}

        {filteredContainers.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
            Không tìm thấy container nào khớp với tiêu chí tìm kiếm.
          </div>
        )}
      </div>

      {/* 2-Step Confirmation Modal */}
      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`Xác nhận thao tác: ${activeModal.action.toUpperCase()}`}
          targetName={activeModal.target.name}
          actionType={activeModal.action}
          isProcessing={isProcessing}
          onConfirm={handleExecuteAction}
          onCancel={() => setActiveModal(null)}
        />
      )}
    </motion.div>
  )
}
