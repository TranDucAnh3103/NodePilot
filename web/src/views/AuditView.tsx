import React, { useState } from 'react'
import { motion } from 'motion/react'
import { ScrollText, Search, CheckCircle2, ShieldAlert, Clock, User, Filter } from 'lucide-react'
import { spring, transition } from '../lib/motion'

interface AuditLogEntry {
  id: string
  createdAt: string
  actor: string
  actionType: string
  targetType: string
  targetName: string
  ipAddress: string
  status: 'SUCCESS' | 'BLOCKED_BY_GUARDRAIL' | 'FAILED'
  details: string
}

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud_9f81a7b',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    actor: 'admin',
    actionType: 'CONTAINER_RESTART',
    targetType: 'docker',
    targetName: 'nodepilot-app-demo',
    ipAddress: '100.82.14.92 (Tailscale)',
    status: 'SUCCESS',
    details: 'Initiated via Web UI with valid Idempotency-Key',
  },
  {
    id: 'aud_8c72b6a',
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    actor: 'admin',
    actionType: 'SERVICE_STOP',
    targetType: 'systemd',
    targetName: 'ssh.service',
    ipAddress: '100.82.14.92 (Tailscale)',
    status: 'BLOCKED_BY_GUARDRAIL',
    details: 'Rejected by Helper Guardrail Engine: Denylisted target',
  },
  {
    id: 'aud_5e41c3d',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    actor: 'admin',
    actionType: 'USER_LOGIN',
    targetType: 'auth',
    targetName: 'admin',
    ipAddress: '100.82.14.92 (Tailscale)',
    status: 'SUCCESS',
    details: 'Argon2id password verification passed, issued JWT session',
  },
  {
    id: 'aud_1a2b3c4',
    createdAt: new Date(Date.now() - 1000 * 3600 * 12).toISOString(),
    actor: 'system',
    actionType: 'SYSTEM_BOOTSTRAP',
    targetType: 'cli',
    targetName: 'hscc-cli',
    ipAddress: '127.0.0.1',
    status: 'SUCCESS',
    details: 'Initial admin account created via CLI bootstrap',
  },
]

export const AuditView: React.FC = () => {
  const [logs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLogs = logs.filter(
    (l) =>
      l.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.targetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.ipAddress.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatTimestamp = (iso: string) => {
    return new Date(iso).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
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
            Bảng lưu trữ bất biến (Append-only). Ghi nhận toàn bộ thao tác đăng nhập, yêu cầu mutate và vi phạm Guardrail.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            Append-only SQLite
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300">
            {logs.length} Bản ghi
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Lọc theo người dùng, hành động, IP..."
          className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
        />
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Người thực hiện</th>
                <th className="py-3 px-4">Hành động & Đối tượng</th>
                <th className="py-3 px-4">Địa chỉ IP</th>
                <th className="py-3 px-4">Kết quả</th>
                <th className="py-3 px-4">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredLogs.map((log) => {
                const isSuccess = log.status === 'SUCCESS'
                const isBlocked = log.status === 'BLOCKED_BY_GUARDRAIL'

                return (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-bold whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{log.actor}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-200">{log.actionType}</div>
                      <div className="text-[10px] text-slate-400">
                        {log.targetType}://<span className="text-indigo-400">{log.targetName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{log.ipAddress}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isSuccess ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>SUCCESS</span>
                        </span>
                      ) : isBlocked ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px]">
                          <ShieldAlert className="w-3 h-3" />
                          <span>BLOCKED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                          <span>FAILED</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans text-xs max-w-xs truncate">
                      {log.details}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
