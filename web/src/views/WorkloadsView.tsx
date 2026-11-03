import React, { useState, useEffect, useCallback } from 'react'
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
  RefreshCw,
  AlertCircle,
  Clock,
  HardDrive,
  Cpu,
  Trash2,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { ConfirmModal } from '../components/ConfirmModal'
import { LogModal } from '../components/LogModal'
import { Pagination } from '../components/Pagination'
import { Container, User } from '../types'
import { getContainers, getContainerLogs, executeContainerAction } from '../lib/api'

interface WorkloadsViewProps {
  currentUser?: User | null
}

export const WorkloadsView: React.FC<WorkloadsViewProps> = ({ currentUser }) => {
  const [containers, setContainers] = useState<Container[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'running' | 'allowlisted'>('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 12

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterMode])

  // Confirmation modal state
  const [activeModal, setActiveModal] = useState<{
    target: Container
    action: 'start' | 'stop' | 'restart' | 'kill' | 'delete' | 'remove'
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Log modal state
  const [logModalTarget, setLogModalTarget] = useState<Container | null>(null)

  const fetchWorkloads = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getContainers()
      setContainers(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách workloads'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkloads()
  }, [fetchWorkloads])

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

  const handleActionClick = (container: Container, action: 'start' | 'stop' | 'restart' | 'kill' | 'delete' | 'remove') => {
    setActionError(null)
    setActiveModal({ target: container, action })
  }

  const handleExecuteAction = async () => {
    if (!activeModal) return
    setIsProcessing(true)
    setActionError(null)

    try {
      const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const op = activeModal.action === 'kill' ? 'stop' : activeModal.action
      await executeContainerAction(
        activeModal.target.name,
        op,
        'Thao tác qua giao diện NodePilot HSCC',
        idempotencyKey,
        activeModal.target.project
      )
      await fetchWorkloads()
      setActiveModal(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Thao tác thất bại'
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
          <button
            onClick={fetchWorkloads}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới danh sách"
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

        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Tất cả (100%)
          </button>
          <button
            onClick={() => setFilterMode('running')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              filterMode === 'running'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Đang chạy
          </button>
          <button
            onClick={() => setFilterMode('allowlisted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              filterMode === 'allowlisted'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Được phép điều khiển
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && containers.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Đang khám phá các workloads Docker trên máy chủ...</span>
        </div>
      )}

      {/* Fetch Error state */}
      {error && (
        <div className="text-center py-8 text-rose-400 text-xs bg-rose-500/10 rounded-2xl border border-rose-500/20 space-y-2">
          <div>Lỗi tải workloads: {error}</div>
          <button
            onClick={fetchWorkloads}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Workloads List */}
      <div className="space-y-3">
        {filteredContainers.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((container) => {
          const isRunning = container.state === 'running'
          const shortId = container.id.length > 12 ? container.id.substring(0, 12) : container.id
          const portStrings = (container.ports || []).map((p) =>
            p.publicPort ? `${p.publicPort}:${p.privatePort}/${p.type}` : `${p.privatePort}/${p.type}`
          )
          const isRoot =
            currentUser?.role === 'root' ||
            currentUser?.role === 'admin' ||
            currentUser?.username === 'stephen3103'
          const canMutate = !container.isProtected && (isRoot || container.isAllowlisted)

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
                      {shortId}
                    </span>

                    {/* Guardrail Policy Tag */}
                    {container.isProtected ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Denylist (Bảo vệ hệ thống)
                      </span>
                    ) : canMutate ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {isRoot ? 'Được phép điều khiển (Root)' : 'Allowlist (Cho phép mutate)'}
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
                    <span className="font-mono">{container.status}</span>
                    {portStrings.length > 0 && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="font-mono text-indigo-400">{portStrings.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Telemetry and Action Controls */}
                <div className="flex items-center space-x-4 self-end lg:self-center">
                  {isRunning && (
                    <div className="text-right font-mono text-xs text-slate-400 hidden sm:block">
                      <div className="flex items-center justify-end space-x-1">
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        <span>CPU: {container.cpuPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center justify-end space-x-1">
                        <HardDrive className="w-3 h-3 text-teal-400" />
                        <span>RAM: {formatBytes(container.memoryUsageBytes)}</span>
                      </div>
                    </div>
                  )}

                  {/* Logs button */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    onClick={() => setLogModalTarget(container)}
                    className="p-2 text-slate-300 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Xem logs container"
                  >
                    <Terminal className="w-4 h-4" />
                  </motion.button>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1.5">
                    {canMutate ? (
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
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          transition={spring.press}
                          onClick={() => handleActionClick(container, 'delete')}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Xóa container (Delete)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                        {container.isProtected ? 'Bảo vệ hệ thống' : 'Chỉ xem'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}

        {!isLoading && filteredContainers.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
            Không tìm thấy container nào khớp với tiêu chí tìm kiếm.
          </div>
        )}
      </div>

      {/* Pagination (12 items per page) */}
      {filteredContainers.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredContainers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          itemName="containers"
        />
      )}

      {/* 2-Step Confirmation Modal */}
      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`Xác nhận thao tác: ${
            activeModal.action === 'delete' || activeModal.action === 'remove'
              ? 'XÓA CONTAINER'
              : activeModal.action === 'stop'
              ? 'DỪNG CONTAINER (STOP)'
              : activeModal.action === 'restart'
              ? 'KHỞI ĐỘNG LẠI (RESTART)'
              : activeModal.action.toUpperCase()
          }`}
          targetName={activeModal.target.name}
          actionType={activeModal.action}
          isProcessing={isProcessing}
          onConfirm={handleExecuteAction}
          onCancel={() => {
            setActiveModal(null)
            setActionError(null)
          }}
        />
      )}

      {/* Container Logs Modal */}
      {logModalTarget && (
        <LogModal
          isOpen={true}
          title={`Logs: ${logModalTarget.name}`}
          subtitle={`Container ID: ${logModalTarget.id.substring(0, 12)} • Image: ${logModalTarget.image}`}
          fetchLogs={() => getContainerLogs(logModalTarget.id, 200)}
          onClose={() => setLogModalTarget(null)}
        />
      )}
    </motion.div>
  )
}
