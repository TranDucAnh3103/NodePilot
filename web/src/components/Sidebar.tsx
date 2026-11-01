import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
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
  X,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { User } from '../types'

interface SidebarProps {
  currentTab: string
  onTabChange: (tab: string) => void
  currentUser?: User | null
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  isMobileOpen = false,
  onCloseMobile,
}) => {
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

  const renderNavItems = (isDrawer = false) => (
    <nav className="space-y-1 relative">
      {menuItems.map((item) => {
        const Icon = item.icon
        const isActive = currentTab === item.id
        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.98 }}
            transition={spring.press}
            onClick={() => {
              onTabChange(item.id)
              if (isDrawer && onCloseMobile) {
                onCloseMobile()
              }
            }}
            className={`relative w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer text-left ${
              isActive
                ? 'text-indigo-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId={isDrawer ? 'mobile-active-indicator' : 'sidebar-active-indicator'}
                className="absolute inset-0 bg-indigo-600/15 border border-indigo-500/25 rounded-xl -z-0"
                transition={spring.highlight}
              />
            )}
            <Icon className={`w-4 h-4 relative z-10 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
            <span className="relative z-10 truncate">{item.label}</span>
          </motion.button>
        )
      })}
    </nav>
  )

  const hardwareBadge = (
    <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Acer Aspire 5733Z</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
      </div>
      <div className="text-[10px] text-slate-500 font-mono">Pentium P6200 • ~3.5 GiB RAM</div>
    </div>
  )

  return (
    <>
      {/* Desktop & Laptop Sidebar */}
      <aside className="w-60 lg:w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex-col justify-between hidden md:flex select-none shrink-0">
        <div className="space-y-6">
          <div className="px-2 py-2 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center p-0.5 border border-indigo-500/30 bg-slate-900/90 shadow-md shadow-indigo-600/15 shrink-0">
              <img src="/icon.svg" alt="NodePilot Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <span className="font-bold tracking-tight text-white block text-sm truncate">NodePilot HSCC</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono block truncate">
                Control Center v1.0
              </span>
            </div>
          </div>

          {renderNavItems(false)}
        </div>

        {hardwareBadge}
      </aside>

      {/* Mobile & Tablet Drawer (Off-Canvas overlay) */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex select-none">
            {/* Backdrop blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.fade}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            {/* Slide-over panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={transition.menu}
              className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 p-4 shadow-2xl flex flex-col justify-between z-10"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center p-0.5 border border-indigo-500/30 bg-slate-900/90 shadow-md shadow-indigo-600/15">
                      <img src="/icon.svg" alt="NodePilot Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <span className="font-bold tracking-tight text-white block text-sm">NodePilot HSCC</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">v1.0 Mobile</span>
                    </div>
                  </div>

                  <button
                    onClick={onCloseMobile}
                    aria-label="Đóng menu"
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                  {renderNavItems(true)}
                </div>
              </div>

              {hardwareBadge}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
