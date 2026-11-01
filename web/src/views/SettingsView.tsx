import React from 'react'
import { motion } from 'motion/react'
import { Settings, ShieldCheck, ShieldAlert, Cpu, HardDrive, Key, FileCode } from 'lucide-react'
import { spring, transition } from '../lib/motion'

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

      {/* Target Host Specification Card */}
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
