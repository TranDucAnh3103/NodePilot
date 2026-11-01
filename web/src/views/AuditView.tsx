import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ScrollText,
  Search,
  CheckCircle2,
  ShieldAlert,
  Clock,
  User,
  Filter,
  RefreshCw,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Copy,
  Check,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { AuditEvent } from '../types'
import { getAuditEvents } from '../lib/api'

export const AuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditEvent[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize] = useState<number>(12)
  const [searchTerm, setSearchTerm] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'denied' | 'failed'>('all')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Selected event for detail inspection modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const fetchAuditLogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await getAuditEvents({
        page: currentPage,
        pageSize,
        keyword: searchTerm.trim() || undefined,
        result: resultFilter === 'all' ? undefined : resultFilter,
      })
      setLogs(res.items || [])
      setTotalCount(res.total || 0)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải nhật ký kiểm toán'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, pageSize, searchTerm, resultFilter])

  useEffect(() => {
    fetchAuditLogs()
  }, [fetchAuditLogs])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

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

  const handleCopyDetails = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusBadge = (result: string) => {
    switch (result.toLowerCase()) {
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>SUCCESS</span>
          </span>
        )
      case 'denied':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="w-3 h-3" />
            <span>DENIED (GUARDRAIL)</span>
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <XCircle className="w-3 h-3" />
            <span>FAILED</span>
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
            <ScrollText className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Nhật ký kiểm toán (Audit Trail)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ghi nhận bất biến (Append-only SQLite) mọi thao tác thay đổi trạng thái, xác thực và các hành vi bị Guardrail ngăn chặn.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300">
            {totalCount} Sự kiện ghi nhận
          </span>
          <button
            onClick={fetchAuditLogs}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới nhật ký"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Tìm theo user, hành động, target, IP..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setResultFilter('all')
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              resultFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => {
              setResultFilter('success')
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              resultFilter === 'success'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Thành công
          </button>
          <button
            onClick={() => {
              setResultFilter('denied')
              setCurrentPage(1)
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              resultFilter === 'denied'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Bị chặn (Guardrail)
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && logs.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Đang truy vấn bảng nhật ký kiểm toán từ SQLite...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-center py-8 text-rose-400 text-xs bg-rose-500/10 rounded-2xl border border-rose-500/20 space-y-2">
          <div>Lỗi tải audit logs: {error}</div>
          <button
            onClick={fetchAuditLogs}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Tài khoản</th>
                <th className="py-3 px-4">Hành động</th>
                <th className="py-3 px-4">Đối tượng</th>
                <th className="py-3 px-4">Địa chỉ IP</th>
                <th className="py-3 px-4">Kết quả</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedEvent(log)}
                >
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-slate-200">
                    <span className="flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{log.actorUsername || log.actorId}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {log.verb}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-indigo-400">
                    <span title={log.target}>{log.target}</span>
                    {log.targetType && (
                      <span className="text-[10px] text-slate-500 ml-1.5 font-normal">
                        ({log.targetType})
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {log.ipAddress || '127.0.0.1'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(log.result)}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedEvent(log)
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                      title="Xem chi tiết sự kiện"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                    Không có sự kiện kiểm toán nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Trang <span className="text-slate-200 font-mono">{currentPage}</span> /{' '}
              <span className="font-mono">{totalPages}</span> (Tổng {totalCount} sự kiện)
            </div>
            <div className="flex items-center space-x-1">
              <button
                disabled={currentPage <= 1 || isLoading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages || isLoading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Event Detail Inspection Modal */}
      {selectedEvent && (
        <AnimatePresence>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.overlay}
              onClick={() => setSelectedEvent(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={spring.dialog}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                    <ScrollText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">Chi tiết sự kiện kiểm toán</h3>
                    <p className="text-xs text-slate-400 font-mono">ID: {selectedEvent.id}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/70 p-4 rounded-xl border border-slate-800 font-mono">
                  <div>
                    <span className="text-slate-500">Thời gian:</span>
                    <div className="text-slate-200 mt-0.5">{formatTimestamp(selectedEvent.timestamp)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Người thực hiện:</span>
                    <div className="text-slate-200 mt-0.5">{selectedEvent.actorUsername || selectedEvent.actorId}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Hành động:</span>
                    <div className="text-indigo-400 font-bold mt-0.5">{selectedEvent.verb}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Kết quả:</span>
                    <div className="mt-0.5">{getStatusBadge(selectedEvent.result)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Mục tiêu:</span>
                    <div className="text-slate-200 mt-0.5">{selectedEvent.target} ({selectedEvent.targetType})</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Địa chỉ IP:</span>
                    <div className="text-slate-200 mt-0.5">{selectedEvent.ipAddress}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Request ID:</span>
                    <div className="text-slate-400 text-[11px] mt-0.5">{selectedEvent.requestId}</div>
                  </div>
                </div>

                {/* Redacted Details JSON */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Dữ liệu chi tiết (Đã khử thông tin nhạy cảm):</span>
                    {selectedEvent.detailsRedactedJson && (
                      <button
                        onClick={() => handleCopyDetails(selectedEvent.detailsRedactedJson || '')}
                        className="flex items-center space-x-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Đã sao chép' : 'Sao chép JSON'}</span>
                      </button>
                    )}
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
                    {selectedEvent.detailsRedactedJson ? (
                      <pre className="whitespace-pre-wrap break-all">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(selectedEvent.detailsRedactedJson), null, 2)
                          } catch {
                            return selectedEvent.detailsRedactedJson
                          }
                        })()}
                      </pre>
                    ) : (
                      <span className="text-slate-500 italic">Không có metadata bổ sung</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-950/80 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>
      )}
    </motion.div>
  )
}
