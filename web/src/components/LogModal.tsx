import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Terminal, X, RefreshCw, Copy, Check } from 'lucide-react'
import { spring, transition } from '../lib/motion'

interface LogModalProps {
  isOpen: boolean
  title: string
  subtitle: string
  fetchLogs: () => Promise<string>
  onClose: () => void
}

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  title,
  subtitle,
  fetchLogs,
  onClose,
}) => {
  const [logs, setLogs] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const loadLogs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchLogs()
      setLogs(data || '(Không có dữ liệu logs)')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải logs'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadLogs()
    } else {
      setLogs('')
      setError(null)
    }
  }, [isOpen])

  const handleCopy = () => {
    if (!logs) return
    navigator.clipboard.writeText(logs)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition.overlay}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={spring.dialog}
          className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 font-mono">{title}</h3>
                <p className="text-xs text-slate-400 font-mono">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={loadLogs}
                disabled={isLoading}
                title="Làm mới logs"
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleCopy}
                disabled={!logs || isLoading}
                title="Sao chép toàn bộ logs"
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Log Stream Content */}
          <div className="flex-1 p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-y-auto selection:bg-indigo-500 selection:text-white leading-relaxed">
            {isLoading && (
              <div className="flex items-center justify-center py-16 text-slate-500 space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Đang truyền dữ liệu logs từ máy chủ...</span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
                Lỗi tải logs: {error}
              </div>
            )}

            {!isLoading && !error && (
              <pre className="whitespace-pre-wrap break-all">{logs}</pre>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span>Dữ liệu logs đã tự động được lọc và ẩn mật khẩu/token bí mật (Secret Redacted).</span>
            <span className="font-mono">Tối đa 200 dòng mới nhất</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
