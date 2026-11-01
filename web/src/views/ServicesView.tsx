import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Activity,
  Search,
  RotateCw,
  Square,
  Play,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  Terminal,
  Lock,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { ConfirmModal } from '../components/ConfirmModal'
import { LogModal } from '../components/LogModal'
import { Pagination } from '../components/Pagination'
import { ServiceUnit } from '../types'
import { getServices, getServiceLogs, executeServiceAction } from '../lib/api'

export const ServicesView: React.FC = () => {
  const [services, setServices] = useState<ServiceUnit[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'core_protected' | 'application' | 'system'>('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 12

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, categoryFilter])

  // Confirmation modal state
  const [activeModal, setActiveModal] = useState<{
    target: ServiceUnit
    action: 'start' | 'stop' | 'restart'
  } | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Log modal state
  const [logModalTarget, setLogModalTarget] = useState<ServiceUnit | null>(null)

  const fetchServicesList = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getServices()
      setServices(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách services'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServicesList()
  }, [fetchServicesList])

  const filteredServices = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    return true
  })

  const handleActionClick = (service: ServiceUnit, action: 'start' | 'stop' | 'restart') => {
    setActionError(null)
    setActiveModal({ target: service, action })
  }

  const handleExecuteAction = async () => {
    if (!activeModal) return
    setIsProcessing(true)
    setActionError(null)

    try {
      const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      await executeServiceAction(
        activeModal.target.name,
        activeModal.action,
        'Thao tác dịch vụ qua NodePilot HSCC',
        idempotencyKey
      )
      await fetchServicesList()
      setActiveModal(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Thao tác service thất bại'
      setActionError(msg)
    } finally {
      setIsProcessing(false)
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
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Dịch vụ Hệ thống (Systemd)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Giám sát toàn bộ systemd services. Các dịch vụ lõi quan trọng (SSH, Tailscale, HSCC, Docker) được khóa bảo vệ tuyệt đối.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {services.filter((s) => s.activeState === 'active').length} Hoạt động
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
            {services.length} Tổng services
          </span>
          <button
            onClick={fetchServicesList}
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

      {/* Search and Category Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên service, mô tả..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              categoryFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setCategoryFilter('core_protected')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              categoryFilter === 'core_protected'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Lõi bảo vệ (Denylist)
          </button>
          <button
            onClick={() => setCategoryFilter('application')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              categoryFilter === 'application'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Ứng dụng (Applications)
          </button>
          <button
            onClick={() => setCategoryFilter('system')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              categoryFilter === 'system'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Hệ thống
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && services.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Đang truy vấn các units systemd trên máy chủ...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8 text-rose-400 text-xs bg-rose-500/10 rounded-2xl border border-rose-500/20 space-y-2">
          <div>Lỗi tải services: {error}</div>
          <button
            onClick={fetchServicesList}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Services List */}
      <div className="space-y-3">
        {filteredServices.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((service) => {
          const isActive = service.activeState === 'active'
          const isProtected = service.isProtected || service.category === 'core_protected'
          const canMutate = service.isAllowlisted && !isProtected

          return (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.pop}
              className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl hover:border-slate-700/80 transition-all shadow-sm"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Service identity */}
                <div className="space-y-1">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isActive ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-slate-600'
                      }`}
                    />
                    <h3 className="font-mono font-bold text-sm text-slate-100">{service.name}</h3>

                    {service.mainPid > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        PID {service.mainPid}
                      </span>
                    )}

                    {/* Guardrail Policy Tag */}
                    {isProtected ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Bảo vệ lõi hệ thống
                      </span>
                    ) : service.isAllowlisted ? (
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

                  <p className="text-xs text-slate-400">{service.description || 'Không có mô tả chi tiết'}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5 font-mono">
                    <span>Trạng thái: {service.activeState} ({service.subState})</span>
                    <span>•</span>
                    <span>Load: {service.loadState}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-3 self-end lg:self-center">
                  {/* Logs button */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    onClick={() => setLogModalTarget(service)}
                    className="p-2 text-slate-300 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Xem journald logs của service"
                  >
                    <Terminal className="w-4 h-4" />
                  </motion.button>

                  {/* Mutate Controls */}
                  {canMutate ? (
                    <div className="flex items-center space-x-1.5">
                      {isActive ? (
                        <>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            transition={spring.press}
                            onClick={() => handleActionClick(service, 'restart')}
                            className="p-2 text-slate-300 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Khởi động lại service"
                          >
                            <RotateCw className="w-4 h-4" />
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            transition={spring.press}
                            onClick={() => handleActionClick(service, 'stop')}
                            className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Dừng service"
                          >
                            <Square className="w-4 h-4" />
                          </motion.button>
                        </>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          transition={spring.press}
                          onClick={() => handleActionClick(service, 'start')}
                          className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Khởi chạy service"
                        >
                          <Play className="w-4 h-4" />
                        </motion.button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic px-2 py-1 bg-slate-950/60 rounded-lg border border-slate-800">
                      {isProtected ? 'Đã khóa an toàn' : 'Chỉ xem'}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}

        {!isLoading && filteredServices.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
            Không tìm thấy service nào khớp với tiêu chí tìm kiếm.
          </div>
        )}
      </div>

      {/* Pagination (12 items per page) */}
      {filteredServices.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredServices.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          itemName="services"
        />
      )}

      {/* 2-Step Confirmation Modal */}
      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`Xác nhận thao tác: ${activeModal.action.toUpperCase()} SERVICE`}
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

      {/* Service Journald Logs Modal */}
      {logModalTarget && (
        <LogModal
          isOpen={true}
          title={`Journald Logs: ${logModalTarget.name}`}
          subtitle={`Unit: ${logModalTarget.name} • Trạng thái: ${logModalTarget.activeState}`}
          fetchLogs={() => getServiceLogs(logModalTarget.name, 200)}
          onClose={() => setLogModalTarget(null)}
        />
      )}
    </motion.div>
  )
}
