import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Power,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  X,
} from 'lucide-react'
import { FirewallStatus, FirewallRule } from '../types'
import { getFirewallStatus, addFirewallRule, deleteFirewallRule, toggleFirewall } from '../lib/api'
import { spring, transition } from '../lib/motion'

export const FirewallView: React.FC = () => {
  const [status, setStatus] = useState<FirewallStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Add rule modal
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newPort, setNewPort] = useState('')
  const [newProto, setNewProto] = useState('tcp')
  const [newAction, setNewAction] = useState<'allow' | 'deny'>('allow')
  const [newFrom, setNewFrom] = useState('')
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete modal
  const [ruleToDelete, setRuleToDelete] = useState<FirewallRule | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toggle modal
  const [isToggleConfirmOpen, setIsToggleConfirmOpen] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const loadStatus = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getFirewallStatus()
      setStatus(data)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Không thể tải trạng thái tường lửa')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPort.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      await addFirewallRule({
        port: newPort.trim(),
        protocol: newProto,
        action: newAction,
        from: newFrom.trim() || undefined,
        comment: newComment.trim() || undefined,
      })
      setActionSuccess(`Đã thêm quy tắc ${newAction.toUpperCase()} cho cổng ${newPort}`)
      setIsAddOpen(false)
      setNewPort('')
      setNewComment('')
      setNewFrom('')
      await loadStatus()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi thêm quy tắc')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteFirewallRule(ruleToDelete.number)
      setActionSuccess(`Đã xóa quy tắc #${ruleToDelete.number}`)
      setRuleToDelete(null)
      await loadStatus()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi xóa quy tắc')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggle = async () => {
    if (!status) return
    setIsToggling(true)
    setError(null)
    try {
      const res = await toggleFirewall(!status.active)
      setStatus(res)
      setActionSuccess(`Đã ${res.active ? 'bật' : 'tắt'} tường lửa UFW thành công`)
      setIsToggleConfirmOpen(false)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi bật/tắt tường lửa')
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Shield className="w-6 h-6 text-indigo-400" />
            <span>Tường lửa UFW (Uncomplicated Firewall)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Quản lý cổng mạng, ngăn chặn truy cập trái phép và bảo vệ an toàn VPS từ xa.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={loadStatus}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => setIsAddOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Mở cổng / Thêm quy tắc</span>
          </motion.button>
        </div>
      </div>

      {/* Alert Notices */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:text-rose-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {actionSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="p-1 hover:text-emerald-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* State */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Trạng thái Tường lửa</div>
            <div className="mt-1 flex items-center space-x-2">
              {status?.active ? (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>ĐANG HOẠT ĐỘNG</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  <span>ĐÃ VÔ HIỆU HÓA</span>
                </span>
              )}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            transition={spring.press}
            onClick={() => setIsToggleConfirmOpen(true)}
            className={`p-2.5 rounded-xl border cursor-pointer transition-colors ${
              status?.active
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={status?.active ? 'Tắt tường lửa' : 'Bật tường lửa'}
          >
            <Power className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Incoming Policy */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
            <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span>Chính sách Chiều vào (Incoming)</span>
          </div>
          <div className="mt-1.5 font-mono text-sm font-semibold text-slate-200 uppercase">
            {status?.defaultIncoming || 'deny (chặn mặc định)'}
          </div>
        </div>

        {/* Outgoing Policy */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-teal-400" />
            <span>Chính sách Chiều ra (Outgoing)</span>
          </div>
          <div className="mt-1.5 font-mono text-sm font-semibold text-slate-200 uppercase">
            {status?.defaultOutgoing || 'allow (cho phép)'}
          </div>
        </div>

        {/* Total Rules */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium flex items-center space-x-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Tổng quy tắc hoạt động</span>
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold text-white">
            {status?.rules?.length || 0}
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Danh sách quy tắc tường lửa</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {status?.rules?.length || 0} quy tắc
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
            <span>Đang tải thông tin quy tắc UFW...</span>
          </div>
        ) : (status?.rules || []).length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span>Chưa có quy tắc nào được thiết lập. Hãy mở cổng để cho phép truy cập.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Cổng / Đích (To)</th>
                  <th className="py-3 px-4">Hành động</th>
                  <th className="py-3 px-4">Nguồn (From)</th>
                  <th className="py-3 px-4">Ghi chú</th>
                  <th className="py-3 px-4 text-right w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {(status?.rules || []).map((rule) => {
                  const isAllow = rule.action.toLowerCase().includes('allow')
                  return (
                    <tr key={`${rule.number}-${rule.to}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-500">{rule.number}</td>
                      <td className="py-3 px-4 font-mono font-medium text-white">{rule.to}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono tracking-wider ${
                            isAllow
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {rule.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">{rule.from}</td>
                      <td className="py-3 px-4 text-slate-400 italic">
                        {rule.comment || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setRuleToDelete(rule)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title={`Xóa quy tắc #${rule.number}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety Notice Card */}
      <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl flex items-start space-x-3 text-xs text-slate-400">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-300">Lưu ý an toàn tường lửa:</span>
          <p>
            Cổng 22 (SSH) và cổng 17880 (NodePilot HSCC) được bảo vệ bởi Denylist Guardrail để chống khóa nhầm truy cập từ xa. Mọi thay đổi quy tắc đều được ghi vào Nhật ký kiểm toán bất biến.
          </p>
        </div>
      </div>

      {/* Add Rule Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span>Thêm quy tắc tường lửa mới</span>
                </h3>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddRule} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Cổng mạng (Port) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: 80, 443, 8080, 3000"
                    value={newPort}
                    onChange={(e) => setNewPort(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Giao thức</label>
                    <select
                      value={newProto}
                      onChange={(e) => setNewProto(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                      <option value="any">Tất cả (TCP/UDP)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Hành động</label>
                    <select
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value as 'allow' | 'deny')}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="allow">ALLOW (Cho phép)</option>
                      <option value="deny">DENY (Chặn)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Địa chỉ nguồn (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    placeholder="để trống = Mọi nơi (Anywhere), hoặc 100.80.113.123"
                    value={newFrom}
                    onChange={(e) => setNewFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Ghi chú quy tắc</label>
                  <input
                    type="text"
                    placeholder="ví dụ: Next.js Web App, Nginx HTTP"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20 transition-colors"
                  >
                    {isSubmitting ? 'Đang lưu...' : 'Tạo quy tắc'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Rule Confirmation Modal */}
      <AnimatePresence>
        {ruleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white text-center">Xóa quy tắc #{ruleToDelete.number}?</h3>
              <p className="text-xs text-slate-400 text-center mt-1.5">
                Bạn có chắc chắn muốn xóa quy tắc cho{' '}
                <span className="font-mono font-semibold text-slate-200">{ruleToDelete.to}</span> ({ruleToDelete.action})? Thao tác này có hiệu lực ngay lập tức.
              </p>

              <div className="mt-5 flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => setRuleToDelete(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteRule}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-rose-600/20 transition-colors"
                >
                  {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toggle Firewall Confirmation Modal */}
      <AnimatePresence>
        {isToggleConfirmOpen && status && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${
                  status.active
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white text-center">
                {status.active ? 'Vô hiệu hóa tường lửa UFW?' : 'Kích hoạt tường lửa UFW?'}
              </h3>
              <p className="text-xs text-slate-400 text-center mt-1.5">
                {status.active
                  ? 'Tất cả các cổng sẽ mở tự do cho đến khi bạn bật lại tường lửa. Hãy chắc chắn máy chủ được bảo vệ bởi Tailscale.'
                  : 'Tất cả các cổng không có trong danh sách cho phép (ALLOW) sẽ bị chặn kết nối từ bên ngoài.'}
              </p>

              <div className="mt-5 flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsToggleConfirmOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={handleToggle}
                  className={`px-4 py-2 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg transition-colors ${
                    status.active
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                  }`}
                >
                  {isToggling ? 'Đang thực hiện...' : status.active ? 'Xác nhận tắt' : 'Xác nhận bật'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
