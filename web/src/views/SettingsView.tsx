import React, { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  Settings,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  GitBranch,
  Terminal,
  Clock,
  User,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { checkUpdate, triggerUpdate } from '../lib/api'
import { UpdateCheckResult } from '../types'

export const SettingsView: React.FC = () => {
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

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null)

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

  useEffect(() => {
    handleCheckUpdate()
  }, [])

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
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Cài đặt & Chính sách Guardrail</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quy tắc bảo vệ máy chủ được nạp từ <span className="font-mono text-indigo-400">/etc/hscc/helper-policy.yaml</span>.
          </p>
        </div>
      </div>

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

      {/* 3. Target Host Specification Card */}
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
    </motion.div>
  )
}
