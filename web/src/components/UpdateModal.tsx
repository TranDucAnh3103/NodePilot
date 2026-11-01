import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  GitCommit,
  User,
  Clock,
  AlertTriangle,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { UpdateCheckResult } from '../types'
import { triggerUpdate } from '../lib/api'
import { spring, transition } from '../lib/motion'

interface UpdateModalProps {
  isOpen: boolean
  updateInfo: UpdateCheckResult | null
  isChecking: boolean
  onClose: () => void
  onCheckAgain: () => void
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  updateInfo,
  isChecking,
  onClose,
  onCheckAgain,
}) => {
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)

  if (!isOpen) return null

  const handleTrigger = async () => {
    setIsUpdating(true)
    setUpdateMessage(null)

    try {
      const res = await triggerUpdate()
      setUpdateMessage(res.message || 'Lệnh cập nhật đã gửi tới Watchtower.')
      setIsDone(true)

      // Poll until server restarts or wait 8 seconds
      setTimeout(() => {
        window.location.reload()
      }, 7000)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUpdateMessage(`Lỗi: ${err.message}`)
      } else {
        setUpdateMessage('Không thể gửi lệnh tới Watchtower')
      }
      setIsUpdating(false)
    }
  }

  const formatTime = (isoString?: string) => {
    if (!isoString) return 'Vừa xong'
    try {
      return new Date(isoString).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition.overlay}
          onClick={!isUpdating ? onClose : undefined}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={spring.dialog}
          className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 z-10 space-y-5"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  updateInfo?.hasUpdate
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}
              >
                {updateInfo?.hasUpdate ? (
                  <ArrowUpCircle className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  {updateInfo?.hasUpdate ? 'Phát hiện Phiên bản Mới' : 'Trạng thái Phiên bản'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tự động cập nhật không cần gõ lệnh qua Watchtower & GHCR
                </p>
              </div>
            </div>

            {!isUpdating && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body Content */}
          {isChecking ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Đang quét kho Git và GitHub Registry...</p>
            </div>
          ) : updateInfo?.hasUpdate ? (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-indigo-500/20 rounded-xl space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Phiên bản hiện tại:</span>
                  <span className="font-mono text-slate-300 font-bold">
                    {updateInfo.currentVersion} ({updateInfo.currentCommit})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Bản mới nhất trên Git:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {updateInfo.latestCommit}
                  </span>
                </div>
                {updateInfo.commitMessage && (
                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-mono mb-1">
                      Nội dung cập nhật mới nhất:
                    </span>
                    <p className="text-slate-200 font-sans italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      "{updateInfo.commitMessage}"
                    </p>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-500 pt-1 font-mono">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {updateInfo.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatTime(updateInfo.publishedAt)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-2.5 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Cập nhật tự động (Zero-Downtime):</p>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    Watchtower sẽ tự động tải image pre-built mới từ GHCR và khởi động lại container trong khoảng 3-5 giây. Toàn bộ dữ liệu SQLite và cấu hình được bảo toàn 100%.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="font-bold text-slate-200 text-sm">Hệ thống đang ở phiên bản mới nhất</p>
              <p className="text-slate-400 font-mono text-[11px]">
                Commit: {updateInfo?.currentCommit || 'ede5c8b'} • Repo: {updateInfo?.repository}
              </p>
            </div>
          )}

          {/* Status Message when Updating */}
          {updateMessage && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center space-x-2">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
              <span>{updateMessage} (Trang sẽ tự động tải lại sau ít giây...)</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={spring.press}
              onClick={onCheckAgain}
              disabled={isChecking || isUpdating}
              className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>Quét lại Git</span>
            </motion.button>

            <div className="flex items-center space-x-2">
              {!isUpdating && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              )}

              {updateInfo?.hasUpdate && !isDone && (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring.press}
                  onClick={handleTrigger}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center space-x-1.5 transition-all shadow-lg shadow-indigo-600/25 cursor-pointer disabled:opacity-50"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang kích hoạt Watchtower...</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="w-4 h-4" />
                      <span>Cập nhật ngay (Không gõ lệnh)</span>
                    </>
                  )}
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
