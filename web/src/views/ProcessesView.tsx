import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Cpu,
  Search,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  AlertCircle,
  Hash,
  Terminal,
  Square,
  Lock,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { Pagination } from '../components/Pagination'
import { ConfirmModal } from '../components/ConfirmModal'
import { ProcessInfo, User } from '../types'
import { getProcesses, killProcess } from '../lib/api'

interface ProcessesViewProps {
  currentUser?: User | null
}

export const ProcessesView: React.FC<ProcessesViewProps> = ({ currentUser }) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'pid'>('cpu')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 12

  // Kill confirmation modal state
  const [activeModal, setActiveModal] = useState<ProcessInfo | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const isRoot =
    currentUser?.role === 'root' ||
    currentUser?.role === 'admin' ||
    currentUser?.username === 'stephen3103'

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortBy, categoryFilter])

  const loadProcesses = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getProcesses(sortBy, 300)
      setProcesses(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách tiến trình'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [sortBy])

  useEffect(() => {
    loadProcesses()
  }, [loadProcesses])

  const handleKillProcess = async () => {
    if (!activeModal) return
    setIsProcessing(true)
    setActionError(null)
    try {
      await killProcess(activeModal.pid)
      await loadProcesses()
      setActiveModal(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể kết thúc tiến trình'
      setActionError(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KiB', 'MiB', 'GiB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  const filteredProcesses = processes.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.commandLine.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pid.toString().includes(searchTerm)

    if (!matchesSearch) return false
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    return true
  })

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'hscc':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">HSCC</span>
      case 'wavelink':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">Wavelink</span>
      case 'docker':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">Docker</span>
      case 'database':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">Database</span>
      case 'network':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-400 border border-teal-500/20">Network</span>
      case 'web':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Web/Proxy</span>
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">System</span>
    }
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
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Khám Phá Tiến Trình Hệ Thống (Process Explorer)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isRoot
              ? 'Quan sát 100% tiến trình chạy trên toàn bộ hệ điều hành. Quyền Root cho phép dừng (kill) tiến trình ngoại trừ PID 1 và HSCC.'
              : 'Quan sát 100% tiến trình chạy trên toàn bộ hệ điều hành. Chế độ chỉ đọc an toàn tuyệt đối (Không cho phép kill PID tùy ý).'}
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          {isRoot ? (
            <span className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Quyền Root (Cho phép dừng)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Read-Only Safe
            </span>
          )}
          <button
            onClick={loadProcesses}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Sorter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên tiến trình, PID..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-500 whitespace-nowrap">Sắp xếp theo:</span>
          <button
            onClick={() => setSortBy('cpu')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              sortBy === 'cpu'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            CPU %
          </button>
          <button
            onClick={() => setSortBy('memory')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              sortBy === 'memory'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            RAM (RSS)
          </button>
          <button
            onClick={() => setSortBy('pid')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              sortBy === 'pid'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            PID
          </button>
        </div>
      </div>

      {/* Process Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">PID</th>
                <th className="py-3 px-4">Tên tiến trình</th>
                <th className="py-3 px-4">Phân loại</th>
                <th className="py-3 px-4">Người dùng</th>
                <th className="py-3 px-4">CPU (%)</th>
                <th className="py-3 px-4">RAM (RSS)</th>
                <th className="py-3 px-4">Lệnh thực thi</th>
                {isRoot && <th className="py-3 px-4 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredProcesses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((p) => {
                const isProtectedPid = p.pid === 1 || p.name.includes('hscc')
                return (
                  <tr key={p.pid} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-indigo-400 font-bold">{p.pid}</td>
                    <td className="py-3 px-4 text-slate-200 font-medium whitespace-nowrap">{p.name}</td>
                    <td className="py-3 px-4 whitespace-nowrap">{getCategoryBadge(p.category)}</td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{p.username || 'system'}</td>
                    <td className="py-3 px-4 text-slate-300">
                      <span className={p.cpuPercent > 10 ? 'text-amber-400 font-bold' : ''}>
                        {p.cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{formatBytes(p.memoryBytes)}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={p.commandLine}>
                      {p.commandLine || p.name}
                    </td>
                    {isRoot && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isProtectedPid ? (
                          <span className="text-[10px] text-slate-500 italic px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800 flex items-center gap-1 inline-flex">
                            <Lock className="w-2.5 h-2.5" /> Khóa
                          </span>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            transition={spring.press}
                            onClick={() => setActiveModal(p)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title={`Dừng tiến trình PID ${p.pid}`}
                          >
                            <Square className="w-3.5 h-3.5" />
                          </motion.button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}

              {!isLoading && filteredProcesses.length === 0 && (
                <tr>
                  <td colSpan={isRoot ? 8 : 7} className="py-12 text-center text-slate-500 text-xs">
                    Không tìm thấy tiến trình nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (12 items per page) */}
        {filteredProcesses.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredProcesses.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemName="tiến trình"
          />
        )}
      </div>

      {/* Kill Process Confirmation Modal */}
      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`XÁC NHẬN DỪNG TIẾN TRÌNH (KILL PID ${activeModal.pid})`}
          targetName={`${activeModal.name} (PID: ${activeModal.pid})`}
          actionType="kill"
          isProcessing={isProcessing}
          onConfirm={handleKillProcess}
          onCancel={() => {
            setActiveModal(null)
            setActionError(null)
          }}
        />
      )}
    </motion.div>
  )
}
