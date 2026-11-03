import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { spring, transition } from '../lib/motion'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  targetName: string
  actionType: 'start' | 'stop' | 'restart' | 'kill' | 'delete' | 'remove'
  onConfirm: () => void
  onCancel: () => void
  isProcessing?: boolean
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  targetName,
  actionType,
  onConfirm,
  onCancel,
  isProcessing = false,
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState('')

  if (!isOpen) return null

  const isDestructive = actionType === 'stop' || actionType === 'kill' || actionType === 'delete' || actionType === 'remove'
  const requiresTypeToConfirm = actionType === 'delete' || actionType === 'remove'

  const isConfirmEnabled = requiresTypeToConfirm
    ? typedConfirmation.trim().toLowerCase() === targetName.toLowerCase()
    : true

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition.overlay}
          onClick={onCancel}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={spring.dialog}
          className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 z-10 space-y-5"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  isDestructive
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                {isDestructive ? <ShieldAlert className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">{title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Xác nhận thao tác điều khiển máy chủ có bảo vệ</p>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-mono">Đối tượng mục tiêu:</span>
              <span className="font-mono font-bold text-indigo-400">{targetName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-mono">Hành động thực hiện:</span>
              <span
                className={`font-mono font-bold uppercase text-[10px] px-2 py-0.5 rounded ${
                  isDestructive ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {actionType}
              </span>
            </div>
          </div>

          {requiresTypeToConfirm && (
            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-medium">
                Để xác nhận, vui lòng nhập chính xác tên mục tiêu: <span className="font-mono text-rose-400 font-bold">{targetName}</span>
              </label>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={targetName}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={spring.press}
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.98 }}
              transition={spring.press}
              onClick={onConfirm}
              disabled={!isConfirmEnabled || isProcessing}
              className={`px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center space-x-2 transition-all cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isProcessing ? 'Đang gửi chỉ lệnh...' : 'Xác nhận thực thi'}</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
