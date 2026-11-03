import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  FileCode,
  Play,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Terminal,
  ShieldCheck,
  RefreshCw,
  X,
  Copy,
  Check,
  Square,
  HardDrive,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { TaskPreset, TaskExecution, User } from '../types'
import { getTaskPresets, getTaskExecutions, triggerTask, cancelTask } from '../lib/api'
import { isUserRoot, canUserEditTab } from '../lib/permissions'
import { ConfirmModal } from '../components/ConfirmModal'

interface TasksViewProps {
  currentUser?: User | null
}

export const TasksView: React.FC<TasksViewProps> = ({ currentUser }) => {
  const [presets, setPresets] = useState<TaskPreset[]>([])
  const [executions, setExecutions] = useState<TaskExecution[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canEdit = canUserEditTab(currentUser, 'tasks')

  // Trigger modal state
  const [activePreset, setActivePreset] = useState<TaskPreset | null>(null)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)

  // Output modal
  const [selectedExecution, setSelectedExecution] = useState<TaskExecution | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [presetsData, execsData] = await Promise.all([
        getTaskPresets(),
        getTaskExecutions(20),
      ])
      setPresets(presetsData)
      setExecutions(execsData)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu tác vụ'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Periodic poll if any task is running
  useEffect(() => {
    const hasRunning = executions.some((e) => e.status === 'running')
    if (!hasRunning) return

    const interval = setInterval(async () => {
      try {
        const data = await getTaskExecutions(20)
        setExecutions(data)
      } catch {
        // Graceful
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [executions])

  const handleTrigger = async () => {
    if (!activePreset) return
    setIsProcessing(true)
    setActionError(null)

    try {
      await triggerTask(activePreset.id)
      setActivePreset(null)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kích hoạt tác vụ thất bại'
      setActionError(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelTask(id)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Hủy tác vụ thất bại'
      setActionError(msg)
    }
  }

  const handleCopyOutput = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return iso
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <RotateCw className="w-3 h-3 animate-spin" />
            <span>ĐANG CHẠY</span>
          </span>
        )
      case 'succeeded':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>THÀNH CÔNG</span>
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
            <Square className="w-3 h-3" />
            <span>ĐÃ HỦY</span>
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>{status.toUpperCase()}</span>
          </span>
        )
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
            <FileCode className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Tự Động Hóa Tác Vụ Định Sẵn</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Chạy các tác vụ quản trị máy chủ được lập trình sẵn trong môi trường bảo vệ cô lập. Nghiêm cấm nhận shell script tùy ý.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">
            {presets.length} Presets có sẵn
          </span>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3 text-xs text-rose-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Preset Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((p) => {
          const isRunning = executions.some((e) => e.presetId === p.id && e.status === 'running')

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.pop}
              className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {p.category}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Timeout: {Math.round(p.timeout / 1e9)}s
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-100">{p.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">
                  {p.dangerLevel === 'safe' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> An toàn
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Có rủi ro
                    </span>
                  )}
                </span>

                {canEdit ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    disabled={isRunning || isProcessing}
                    onClick={() => setActivePreset(p)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5"
                  >
                    {isRunning ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang thực thi...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Kích hoạt tác vụ</span>
                      </>
                    )}
                  </motion.button>
                ) : (
                  <span className="text-[11px] font-mono text-slate-500 italic px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800">
                    Chỉ xem
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Execution History Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-2">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">Lịch sử thực thi tác vụ</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">20 lần chạy gần nhất</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Tác vụ</th>
                <th className="py-3 px-4">Người chạy</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Mã thoát</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {executions.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {formatTimestamp(e.startedAt)}
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-slate-200">
                    {e.presetName || e.presetId}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {e.actorUsername || e.actorId}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(e.status)}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{e.exitCode}</td>
                  <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                    {e.status === 'running' && (
                      <button
                        onClick={() => handleCancel(e.id)}
                        className="px-2 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 rounded text-[11px] font-mono cursor-pointer transition-colors"
                      >
                        Hủy
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedExecution(e)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono cursor-pointer transition-colors"
                    >
                      Xem Output
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && executions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                    Chưa có lượt thực thi tác vụ nào được ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {activePreset && (
        <ConfirmModal
          isOpen={true}
          title={`Xác nhận kích hoạt: ${activePreset.name}`}
          targetName={activePreset.id}
          actionType="start"
          isProcessing={isProcessing}
          onConfirm={handleTrigger}
          onCancel={() => {
            setActivePreset(null)
            setActionError(null)
          }}
        />
      )}

      {/* Output Viewer Modal */}
      {selectedExecution && (
        <AnimatePresence>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.overlay}
              onClick={() => setSelectedExecution(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={spring.dialog}
              className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden"
            >
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">
                      Log thực thi: {selectedExecution.presetName || selectedExecution.presetId}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">ID: {selectedExecution.id}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopyOutput(selectedExecution.output)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Sao chép output"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setSelectedExecution(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-y-auto selection:bg-indigo-500 selection:text-white leading-relaxed">
                <pre className="whitespace-pre-wrap break-all">
                  {selectedExecution.output || '(Không có dữ liệu log output)'}
                </pre>
              </div>

              <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Trạng thái: {selectedExecution.status.toUpperCase()}</span>
                <span>Mã thoát: {selectedExecution.exitCode}</span>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>
      )}
    </motion.div>
  )
}
