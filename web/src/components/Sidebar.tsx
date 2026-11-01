import React from 'react'
import { motion } from 'motion/react'
import {
  LayoutDashboard,
  Cpu,
  Layers,
  Activity,
  FileCode,
  FolderOpen,
  ListOrdered,
  ScrollText,
  Settings,
  Server,
} from 'lucide-react'
import { spring } from '../lib/motion'
import { User } from '../types'

interface SidebarProps {
  currentTab: string
  onTabChange: (tab: string) => void
  currentUser?: User | null
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange, currentUser }) => {
  const allMenuItems = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'system', label: 'Hệ thống', icon: Cpu },
    { id: 'docker', label: 'Docker Workloads', icon: Layers },
    { id: 'services', label: 'Dịch vụ systemd', icon: Activity },
    { id: 'processes', label: 'Tiến trình host', icon: ListOrdered },
    { id: 'tasks', label: 'Tác vụ định sẵn', icon: FileCode },
    { id: 'files', label: 'Tệp Sandbox', icon: FolderOpen },
    { id: 'audit', label: 'Nhật ký kiểm toán', icon: ScrollText },
    { id: 'settings', label: 'Cài đặt & Chính sách', icon: Settings },
  ]

  const isRoot =
    currentUser?.role === 'root' ||
    currentUser?.username === 'stephen3103' ||
    currentUser?.username === 'tranducanh31032006@gmail.com' ||
    currentUser?.role === 'admin'

  const menuItems = allMenuItems.filter((item) => {
    if (isRoot) return true
    if (item.id === 'system') return true
    const viewTabs = currentUser?.permissions?.viewTabs || ['overview']
    return viewTabs.includes(item.id)
  })

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between hidden md:flex select-none">
      <div className="space-y-6">
        <div className="px-3 py-2 flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
            <Server className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white block text-sm">NodePilot HSCC</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Control Center v1.0</span>
          </div>
        </div>

        <nav className="space-y-1 relative">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentTab === item.id
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.98 }}
                transition={spring.press}
                onClick={() => onTabChange(item.id)}
                className={`relative w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'text-indigo-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute inset-0 bg-indigo-600/15 border border-indigo-500/25 rounded-lg -z-0"
                    transition={spring.highlight}
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            )
          })}
        </nav>
      </div>

      <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-300">Acer Aspire 5733Z</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">Pentium P6200 • ~3.5 GiB RAM</div>
      </div>
    </aside>
  )
}
