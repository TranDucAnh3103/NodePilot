import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Settings,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Users,
  UserPlus,
  Mail,
  Send,
  Trash2,
  Check,
  X,
  Shield,
  Layers,
  Save,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import {
  checkUpdate,
  triggerUpdate,
  getAccounts,
  createAccount,
  updateAccountRole,
  deleteAccount,
  getEmailAllowlist,
  addEmailAllowlist,
  removeEmailAllowlist,
  getSMTPConfig,
  updateSMTPConfig,
  testSMTP,
} from '../lib/api'
import { UpdateCheckResult, User, SMTPConfig, UserRole } from '../types'

interface SettingsViewProps {
  currentUser?: User | null
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rbac' | 'otp_smtp'>('overview')

  // --- Guardrail Data ---
  const denylistServices = [
    'ssh.service',
    'sshd.service',
    'tailscaled.service',
    'cloudflared.service',
    'nginx.service',
    'caddy.service',
    'docker.service',
    'containerd.service',
    'hscc-api.service',
    'hscc-helper.service',
    'systemd-*',
  ]

  const allowlistServices = [
    'nodepilot-app.service',
    'grafana-monitoring',
    'nodepilot-app-demo',
    'legacy-backup-worker',
  ]

  // --- Update State ---
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null)

  // --- Accounts State ---
  const [accounts, setAccounts] = useState<User[]>([])
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('operator')
  const [userError, setUserError] = useState<string | null>(null)
  const [userSuccess, setUserSuccess] = useState<string | null>(null)

  // --- Gmail Allowlist State ---
  const [emailAllowlist, setEmailAllowlist] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<{ text: string; isError: boolean } | null>(null)

  // --- SMTP State ---
  const [smtpConfig, setSmtpConfig] = useState<SMTPConfig>({
    host: 'smtp.gmail.com',
    port: 587,
    username: 'tranducanh31032006@gmail.com',
    password: '',
    fromName: 'stephen lab',
    appName: 'badminton',
  })
  const [testEmailTarget, setTestEmailTarget] = useState('tranducanh31032006@gmail.com')
  const [isSavingSmtp, setIsSavingSmtp] = useState(false)
  const [isTestingSmtp, setIsTestingSmtp] = useState(false)
  const [smtpFeedback, setSmtpFeedback] = useState<{ text: string; isError: boolean } | null>(null)

  // Load update info
  const handleCheckUpdate = async () => {
    setIsChecking(true)
    setUpdateStatusMsg(null)
    try {
      const res = await checkUpdate()
      setUpdateInfo(res)
    } catch {
      // Graceful fallback
    } finally {
      setIsChecking(false)
    }
  }

  const handleTriggerUpdate = async () => {
    setIsUpdating(true)
    setUpdateStatusMsg('Đang gửi lệnh tới Watchtower daemon...')
    try {
      const res = await triggerUpdate()
      setUpdateStatusMsg(res.message || 'Lệnh cập nhật đã kích hoạt thành công.')
      setTimeout(() => {
        window.location.reload()
      }, 7000)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUpdateStatusMsg(`Lỗi: ${err.message}`)
      } else {
        setUpdateStatusMsg('Lỗi khi kích hoạt cập nhật')
      }
      setIsUpdating(false)
    }
  }

  // Load accounts
  const loadAccountsData = async () => {
    setIsLoadingAccounts(true)
    try {
      const list = await getAccounts()
      setAccounts(list)
    } catch (err: unknown) {
      if (err instanceof Error) setUserError(err.message)
    } finally {
      setIsLoadingAccounts(false)
    }
  }

  // Load Gmail allowlist & SMTP
  const loadOtpSmtpData = async () => {
    try {
      const list = await getEmailAllowlist()
      setEmailAllowlist(list)
    } catch {
      setEmailAllowlist(['tranducanh31032006@gmail.com'])
    }
    try {
      const cfg = await getSMTPConfig()
      if (cfg) {
        setSmtpConfig(cfg)
        if (cfg.username) setTestEmailTarget(cfg.username)
      }
    } catch {
      // Fallback
    }
  }

  useEffect(() => {
    handleCheckUpdate()
    loadAccountsData()
    loadOtpSmtpData()
  }, [])

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError(null)
    setUserSuccess(null)
    if (!newUsername.trim() || !newPassword.trim()) {
      setUserError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu')
      return
    }
    try {
      await createAccount(newUsername.trim(), newPassword, newRole)
      setUserSuccess(`Đã tạo thành công tài khoản '${newUsername.trim()}' với quyền ${newRole.toUpperCase()}`)
      setNewUsername('')
      setNewPassword('')
      setShowAddUserModal(false)
      loadAccountsData()
    } catch (err: unknown) {
      if (err instanceof Error) setUserError(err.message)
    }
  }

  // Change Role
  const handleChangeRole = async (userId: string, targetRole: UserRole) => {
    try {
      await updateAccountRole(userId, targetRole)
      setUserSuccess('Đã cập nhật vai trò người dùng')
      loadAccountsData()
    } catch (err: unknown) {
      if (err instanceof Error) setUserError(err.message)
    }
  }

  // Delete User
  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản '${username}'?`)) return
    try {
      await deleteAccount(userId)
      setUserSuccess(`Đã xóa tài khoản '${username}'`)
      loadAccountsData()
    } catch (err: unknown) {
      if (err instanceof Error) setUserError(err.message)
    }
  }

  // Add Email Allowlist
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailMsg(null)
    if (!newEmail.trim()) return
    try {
      await addEmailAllowlist(newEmail.trim())
      setEmailMsg({ text: `Đã thêm ${newEmail.trim()} vào danh sách cho phép`, isError: false })
      setNewEmail('')
      loadOtpSmtpData()
    } catch (err: unknown) {
      if (err instanceof Error) setEmailMsg({ text: err.message, isError: true })
    }
  }

  // Remove Email Allowlist
  const handleRemoveEmail = async (email: string) => {
    if (emailAllowlist.length <= 1) {
      setEmailMsg({ text: 'Phải giữ lại ít nhất 1 email trong danh sách truy cập!', isError: true })
      return
    }
    if (!window.confirm(`Xóa ${email} khỏi danh sách được phép đăng nhập?`)) return
    try {
      await removeEmailAllowlist(email)
      setEmailMsg({ text: `Đã xóa ${email}`, isError: false })
      loadOtpSmtpData()
    } catch (err: unknown) {
      if (err instanceof Error) setEmailMsg({ text: err.message, isError: true })
    }
  }

  // Save SMTP Config
  const handleSaveSMTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingSmtp(true)
    setSmtpFeedback(null)
    try {
      await updateSMTPConfig(smtpConfig)
      setSmtpFeedback({ text: 'Cấu hình SMTP đã được lưu thành công!', isError: false })
    } catch (err: unknown) {
      if (err instanceof Error) setSmtpFeedback({ text: err.message, isError: true })
    } finally {
      setIsSavingSmtp(false)
    }
  }

  // Test SMTP Send
  const handleTestSMTP = async () => {
    setIsTestingSmtp(true)
    setSmtpFeedback(null)
    try {
      const res = await testSMTP(testEmailTarget)
      setSmtpFeedback({ text: res.message || 'Gửi email kiểm tra thành công! Hãy kiểm tra hộp thư đến.', isError: false })
    } catch (err: unknown) {
      if (err instanceof Error) setSmtpFeedback({ text: err.message, isError: true })
    } finally {
      setIsTestingSmtp(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className="space-y-6"
    >
      {/* Header Banner & Sub-Tabs */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Cài đặt & Trung tâm Quản trị</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quản lý tài khoản, ma trận phân quyền RBAC, xác thực Gmail OTP và chính sách Guardrail.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Chính sách & Cập nhật</span>
          </button>
          <button
            onClick={() => setActiveTab('rbac')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'rbac'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tài khoản & Phân quyền</span>
          </button>
          <button
            onClick={() => setActiveTab('otp_smtp')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'otp_smtp'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail Allowlist & SMTP</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: OVERVIEW & GUARDRAILS & WATCHTOWER                      */}
      {/* ============================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 1. Automated Updates & Watchtower Integration Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Tự động Cập nhật Không Gõ Lệnh (Watchtower Engine)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Tự động kéo image mới từ GHCR, tự dọn image cũ và khởi động lại container chỉ với 1 click.
                  </p>
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={spring.press}
                onClick={handleCheckUpdate}
                disabled={isChecking || isUpdating}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center space-x-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'Đang quét Git...' : 'Quét Git tìm bản mới nhất'}</span>
              </motion.button>
            </div>

            {/* Update Status Card */}
            <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-mono">Phiên bản hiện tại</span>
                  <span className="font-mono font-bold text-slate-200 mt-0.5 block">
                    {updateInfo?.currentVersion || 'v1.0.0'} ({updateInfo?.currentCommit || 'ede5c8b'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-mono">Trạng thái Watchtower</span>
                  <span className="text-emerald-400 font-medium mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Tự động quét hàng ngày (Cleanup ON)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-mono">Nguồn Image</span>
                  <span className="font-mono text-slate-300 mt-0.5 block truncate">
                    {updateInfo?.repository ? `ghcr.io/${updateInfo.repository.toLowerCase()}` : 'ghcr.io/tranducanh3103/nodepilot'}
                  </span>
                </div>
              </div>

              {updateInfo?.hasUpdate ? (
                <div className="pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 text-indigo-300 font-semibold">
                        <ArrowUpCircle className="w-4 h-4 text-indigo-400" />
                        <span>Đã phát hiện bản commit mới trên Git ({updateInfo.latestCommit})</span>
                      </div>
                      {updateInfo.commitMessage && (
                        <p className="text-slate-300 italic text-[11px]">
                          "{updateInfo.commitMessage}"
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 font-mono">
                        Tác giả: {updateInfo.author} • Ngày đẩy: {new Date(updateInfo.publishedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      transition={spring.press}
                      onClick={handleTriggerUpdate}
                      disabled={isUpdating}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition-all shadow-lg shadow-indigo-600/30 shrink-0 disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang cập nhật...</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="w-4 h-4" />
                          <span>Cập nhật ngay</span>
                        </>
                      )}
                    </motion.button>
                  </div>

                  {updateStatusMsg && (
                    <div className="text-xs text-indigo-400 font-mono flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{updateStatusMsg}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-800/60 flex items-center space-x-2 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Máy chủ đang chạy phiên bản mới nhất, không có commit mới.</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Guardrail Policy Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Denylist Guardrail Policy Card */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Denylist (Khóa cứng hệ thống)</h3>
                  <p className="text-xs text-slate-400">Tuyệt đối cấm can thiệp hoặc tắt các dịch vụ nền tảng</p>
                </div>
              </div>

              <div className="space-y-2">
                {denylistServices.map((svc) => (
                  <div
                    key={svc}
                    className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-slate-300">{svc}</span>
                    <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      Protected
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Allowlist Policy Card */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Allowlist (Workloads được cấp phép)</h3>
                  <p className="text-xs text-slate-400">Các mục tiêu cho phép thực hiện thao tác Start / Stop / Restart</p>
                </div>
              </div>

              <div className="space-y-2">
                {allowlistServices.map((svc) => (
                  <div
                    key={svc}
                    className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-slate-300">{svc}</span>
                    <span className="text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                      Managed Target
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Hardware Spec Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Hồ sơ phần cứng & Môi trường triển khai
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Thiết bị máy chủ</span>
                <span className="font-semibold text-slate-200 mt-1 block">Acer Aspire 5733Z Laptop</span>
                <span className="text-[10px] text-slate-400 font-mono">Arrandale Mobile Platform</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Vi xử lý & Bộ nhớ</span>
                <span className="font-semibold text-slate-200 mt-1 block">Intel Pentium P6200 (2C/2T)</span>
                <span className="text-[10px] text-slate-400 font-mono">3.5 GiB DDR3 Shared VRAM</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-500 text-[10px] uppercase font-mono block">Mạng điều khiển an toàn</span>
                <span className="font-semibold text-slate-200 mt-1 block">Tailscale Mesh VPN</span>
                <span className="text-[10px] text-slate-400 font-mono">Socket IPC: /run/hscc/helper.sock</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: RBAC MATRIX & ACCOUNTS MANAGEMENT                       */}
      {/* ============================================================== */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          {/* Notifications */}
          {userError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{userError}</span>
              </div>
              <button onClick={() => setUserError(null)} className="text-rose-400 hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {userSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{userSuccess}</span>
              </div>
              <button onClick={() => setUserSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* RBAC Matrix Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Ma trận Phân quyền Tài khoản (RBAC Matrix)</h3>
                <p className="text-xs text-slate-400">
                  Quy định quyền truy cập và giới hạn thao tác theo 3 cấp độ bảo mật nghiêm ngặt.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Phân hệ & Tính năng</th>
                    <th className="py-2.5 px-3 text-center text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">VIEWER</span>
                      <span className="block text-[10px] text-slate-500 font-sans mt-0.5">Chỉ xem</span>
                    </th>
                    <th className="py-2.5 px-3 text-center text-teal-300">
                      <span className="px-2 py-0.5 rounded bg-teal-500/15 border border-teal-500/30">OPERATOR</span>
                      <span className="block text-[10px] text-slate-500 font-sans mt-0.5">Vận hành</span>
                    </th>
                    <th className="py-2.5 px-3 text-center text-indigo-300">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30">ADMIN</span>
                      <span className="block text-[10px] text-slate-500 font-sans mt-0.5">Quản trị toàn quyền</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Giám sát Host (CPU, RAM, Đĩa, Mạng, Nhiệt độ)</td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Process Explorer (Xem 100% tiến trình hệ thống)</td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Docker Workloads (Xem & Logs tất cả containers)</td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Khởi động / Dừng / Khởi động lại Container (Allowlist)</td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Systemd Services (Xem trạng thái 240+ services)</td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Thao tác Service Allowlist (Restart service cho phép)</td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Tác vụ định sẵn & Sao lưu SQLite an toàn</td>
                    <td className="py-2.5 px-3 text-center"><span className="text-[10px] text-slate-500">Chỉ xem</span></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">File Sandbox (Sửa tệp cấu hình cho phép)</td>
                    <td className="py-2.5 px-3 text-center"><span className="text-[10px] text-slate-500">Chỉ đọc</span></td>
                    <td className="py-2.5 px-3 text-center"><span className="text-[10px] text-slate-500">Chỉ đọc</span></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Quản lý Tài khoản & Quyền hạn (Tạo, Sửa, Xóa user)</td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Gmail OTP Allowlist & Thiết lập SMTP Server</td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><X className="w-4 h-4 text-rose-500 mx-auto" /></td>
                    <td className="py-2.5 px-3 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Accounts List & Management */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Danh sách Tài khoản Hệ thống</h3>
                  <p className="text-xs text-slate-400">
                    Tổng số tài khoản đã đăng ký: <span className="font-mono text-indigo-400 font-bold">{accounts.length}</span>
                  </p>
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={spring.press}
                onClick={() => setShowAddUserModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-indigo-600/30 transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Thêm tài khoản mới</span>
              </motion.button>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Tài khoản</th>
                    <th className="py-2.5 px-3">Vai trò (Role)</th>
                    <th className="py-2.5 px-3">Ngày tạo</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {accounts.map((acc) => {
                    const isSelf = currentUser?.id === acc.id || currentUser?.username === acc.username
                    return (
                      <tr key={acc.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-3 font-medium">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-slate-100">{acc.username}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                                Hiện tại
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-1.5">
                            {acc.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                ADMIN
                              </span>
                            ) : acc.role === 'operator' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                                OPERATOR
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                VIEWER
                              </span>
                            )}

                            {/* Role quick toggle */}
                            {!isSelf && (
                              <select
                                value={acc.role}
                                onChange={(e) => handleChangeRole(acc.id, e.target.value as UserRole)}
                                className="bg-slate-950 border border-slate-800 text-[11px] rounded px-1.5 py-0.5 text-slate-300 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="admin">ADMIN</option>
                                <option value="operator">OPERATOR</option>
                                <option value="viewer">VIEWER</option>
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {acc.createdAt ? new Date(acc.createdAt).toLocaleString('vi-VN') : 'Mặc định'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {!isSelf && (
                            <button
                              onClick={() => handleDeleteUser(acc.id, acc.username)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add User Modal */}
          <AnimatePresence>
            {showAddUserModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <UserPlus className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold text-slate-100">Thêm Tài khoản Mới</h3>
                    </div>
                    <button
                      onClick={() => setShowAddUserModal(false)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Tên đăng nhập (Username)</label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="ví dụ: operator1"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Mật khẩu (Tối thiểu 6 ký tự)</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Vai trò & Phân quyền (Role)</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="operator">OPERATOR (Vận hành container & service)</option>
                        <option value="viewer">VIEWER (Chỉ xem dữ liệu & logs)</option>
                        <option value="admin">ADMIN (Quản trị toàn quyền)</option>
                      </select>
                    </div>

                    <div className="pt-3 flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowAddUserModal(false)}
                        className="px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-800"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                      >
                        Tạo tài khoản
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: GMAIL ALLOWLIST & SMTP SETTINGS                         */}
      {/* ============================================================== */}
      {activeTab === 'otp_smtp' && (
        <div className="space-y-6">
          {/* Notifications */}
          {emailMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between ${
                emailMsg.isError
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                {emailMsg.isError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                <span>{emailMsg.text}</span>
              </div>
              <button onClick={() => setEmailMsg(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {smtpFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between ${
                smtpFeedback.isError
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                {smtpFeedback.isError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                <span>{smtpFeedback.text}</span>
              </div>
              <button onClick={() => setSmtpFeedback(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 1. Gmail OTP Allowlist */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Danh sách Gmail Cho phép Đăng nhập (White List)</h3>
                <p className="text-xs text-slate-400">
                  Chỉ những Gmail nằm trong danh sách này mới có thể nhận mã xác thực OTP 6 số để đăng nhập.
                </p>
              </div>
            </div>

            {/* Add Email Form */}
            <form onSubmit={handleAddEmail} className="flex gap-2 text-xs">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Nhập Gmail mới (ví dụ: admin@gmail.com)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={spring.press}
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Thêm Gmail</span>
              </motion.button>
            </form>

            {/* Email list */}
            <div className="space-y-2 pt-2">
              {emailAllowlist.map((email) => (
                <div
                  key={email}
                  className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2.5">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span className="font-mono text-slate-200 font-medium">{email}</span>
                  </div>

                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                    title="Xóa khỏi danh sách"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 2. SMTP Server Configuration */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Cấu hình Máy chủ Gửi Email (Gmail SMTP)</h3>
                <p className="text-xs text-slate-400">
                  Cấu hình tài khoản gửi thư tự động (Mật khẩu ứng dụng Google App Password 16 ký tự).
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSMTP} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">SMTP Host</label>
                  <input
                    type="text"
                    required
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">SMTP Port (587 TLS hoặc 465 SSL)</label>
                  <input
                    type="number"
                    required
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) || 587 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">Tài khoản gửi (Email)</label>
                  <input
                    type="email"
                    required
                    value={smtpConfig.username}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                    Google App Password (16 ký tự)
                  </label>
                  <input
                    type="password"
                    value={smtpConfig.password || ''}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                    placeholder="Nhập nếu muốn đổi mật khẩu mới"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">Tên hiển thị gửi (From Name)</label>
                  <input
                    type="text"
                    required
                    value={smtpConfig.fromName}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                    placeholder="ví dụ: stephen lab"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-mono text-[11px]">Tên ứng dụng trong Email (App Name)</label>
                  <input
                    type="text"
                    required
                    value={smtpConfig.appName}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, appName: e.target.value })}
                    placeholder="ví dụ: badminton"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="email"
                    value={testEmailTarget}
                    onChange={(e) => setTestEmailTarget(e.target.value)}
                    placeholder="Nhập email nhận thử nghiệm"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    type="button"
                    onClick={handleTestSMTP}
                    disabled={isTestingSmtp}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isTestingSmtp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Gửi thử nghiệm</span>
                  </motion.button>
                </div>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  transition={spring.press}
                  type="submit"
                  disabled={isSavingSmtp}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSavingSmtp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu cấu hình SMTP</span>
                </motion.button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  )
}
