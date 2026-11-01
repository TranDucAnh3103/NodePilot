import React, { useState } from 'react'
import { motion } from 'motion/react'
import {
  Activity,
  Search,
  RotateCw,
  Square,
  Play,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { ConfirmModal } from '../components/ConfirmModal'

interface SystemdUnit {
  name: string
  description: string
  loadState: string
  activeState: 'active' | 'inactive' | 'failed'
  subState: string
  isAllowlisted: boolean
  isDenylisted: boolean
}

const INITIAL_SERVICES: SystemdUnit[] = [
  {
    name: 'ssh.service',
    description: 'OpenBSD Secure Shell server',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: true, // Denylisted critical access
  },
  {
    name: 'tailscaled.service',
    description: 'Tailscale node agent',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: true, // Denylisted mesh network
  },
  {
    name: 'docker.service',
    description: 'Docker Application Container Engine',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: true, // Denylisted engine
  },
  {
    name: 'hscc-api.service',
    description: 'NodePilot HSCC API Daemon',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: true, // Self-protection
  },
  {
    name: 'hscc-helper.service',
    description: 'NodePilot HSCC Privileged Root Helper',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: true, // Self-protection
  },
  {
    name: 'nodepilot-app.service',
    description: 'NodePilot User Application Host',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: true, // Managed target
    isDenylisted: false,
  },
  {
    name: 'rsyslog.service',
    description: 'System Logging Service',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: false,
  },
  {
    name: 'cron.service',
    description: 'Regular background program processing daemon',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    isAllowlisted: false,
    isDenylisted: false,
  },
]

export const ServicesView: React.FC = () => {
  const [services, setServices] = useState<SystemdUnit[]>(INITIAL_SERVICES)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'allowlisted'>('all')

  const [activeModal, setActiveModal] = useState<{
    target: SystemdUnit
    action: 'start' | 'stop' | 'restart' | 'kill'
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const filteredServices = services.filter((s) => {
    const matches =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matches) return false
    if (filterMode === 'active') return s.activeState === 'active'
    if (filterMode === 'allowlisted') return s.isAllowlisted
    return true
  })

  const handleActionClick = (unit: SystemdUnit, action: 'start' | 'stop' | 'restart' | 'kill') => {
    setActiveModal({ target: unit, action })
  }

  const handleExecuteAction = () => {
    if (!activeModal) return
    setIsProcessing(true)

    setTimeout(() => {
      setServices((prev) =>
        prev.map((s) => {
          if (s.name === activeModal.target.name) {
            if (activeModal.action === 'stop') {
              return { ...s, activeState: 'inactive', subState: 'dead' }
            }
            if (activeModal.action === 'start' || activeModal.action === 'restart') {
              return { ...s, activeState: 'active', subState: 'running' }
            }
          }
          return s
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
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Quan sát Dịch vụ systemd</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quan sát 100% services trên máy chủ Ubuntu. Thao tác Restart được bảo vệ qua socket helper có xác thực.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {services.filter((s) => s.activeState === 'active').length} Hoạt động
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
            {services.length} Tổng services
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
            placeholder="Tìm unit, mô tả..."
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
            onClick={() => setFilterMode('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'active'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Đang hoạt động
          </button>
          <button
            onClick={() => setFilterMode('allowlisted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              filterMode === 'allowlisted'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Cho phép điều khiển
          </button>
        </div>
      </div>

      {/* Units List */}
      <div className="space-y-2.5">
        {filteredServices.map((unit) => {
          const isActive = unit.activeState === 'active'
          return (
            <motion.div
              key={unit.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.pop}
              className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                    }`}
                  />
                  <h3 className="font-mono font-bold text-sm text-slate-100">{unit.name}</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                    {unit.subState}
                  </span>

                  {unit.isDenylisted ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Denylist (Khóa cứng)
                    </span>
                  ) : unit.isAllowlisted ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Allowlist (Cho phép mutate)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                      Chỉ quan sát
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 pl-4.5">{unit.description}</p>
              </div>

              <div className="flex items-center space-x-2 self-end md:self-center">
                {unit.isAllowlisted ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    onClick={() => handleActionClick(unit, 'restart')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Khởi động lại</span>
                  </motion.button>
                ) : (
                  <span className="text-[11px] text-slate-500 italic px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                    Không có quyền can thiệp
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`Khởi động lại dịch vụ: ${activeModal.target.name}`}
          targetName={activeModal.target.name}
          actionType="restart"
          isProcessing={isProcessing}
          onConfirm={handleExecuteAction}
          onCancel={() => setActiveModal(null)}
        />
      )}
    </motion.div>
  )
}
