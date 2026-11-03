import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  LayoutDashboard,
  Terminal,
  FolderOpen,
  Shield,
  Globe,
  Layers,
  Activity,
  ListOrdered,
  FileCode,
  ScrollText,
  Settings,
  X,
  Server,
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

interface MenuItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  rootOnly?: boolean
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const isRoot =
    currentUser?.role === 'root' ||
    currentUser?.role === 'admin' ||
    currentUser?.username === 'stephen3103' ||
    currentUser?.username === 'tranducanh31032006@gmail.com'

  const sections: MenuSection[] = [
    {
      title: 'ĐIỀU KHIỂN VPS',
      items: [
        { id: 'overview', label: 'Tổng quan VPS', icon: LayoutDashboard },
        { id: 'terminal', label: 'Web Terminal', icon: Terminal, rootOnly: true },
        { id: 'files', label: 'Quản lý Tệp & Dự án', icon: FolderOpen },
        { id: 'firewall', label: 'Tường lửa UFW', icon: Shield, rootOnly: true },
        { id: 'nginx', label: 'Nginx Reverse Proxy', icon: Globe, rootOnly: true },
      ],
    },
    {
      title: 'QUAN SÁT HỆ THỐNG',
      items: [
        { id: 'docker', label: 'Docker Workloads', icon: Layers },
        { id: 'services', label: 'Dịch vụ systemd', icon: Activity },
        { id: 'processes', label: 'Tiến trình host', icon: ListOrdered },
      ],
    },
    {
      title: 'HỆ THỐNG & BẢO MẬT',
      items: [
        { id: 'tasks', label: 'Tác vụ định sẵn', icon: FileCode },
        { id: 'audit', label: 'Nhật ký kiểm toán', icon: ScrollText },
        { id: 'settings', label: 'Cài đặt & Phân quyền', icon: Settings, rootOnly: true },
      ],
    },
  ]

  const isItemVisible = (item: MenuItem) => {
    if (item.rootOnly && !isRoot) return false
    return true
  }

  const renderNavSection = (section: MenuSection, isDrawer = false) => {
    const visibleItems = section.items.filter(isItemVisible)
    if (visibleItems.length === 0) return null

    return (
      <div key={section.title} className="space-y-1">
        <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase font-mono">
          {section.title}
        </div>
        {visibleItems.map((item) => {
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
              className={`relative w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
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
              <Icon
                className={`w-4 h-4 relative z-10 shrink-0 ${
                  isActive ? 'text-indigo-400' : 'text-slate-400'
                }`}
              />
              <span className="relative z-10 truncate">{item.label}</span>
            </motion.button>
          )
        })}
      </div>
    )
  }

  const hardwareBadge = (
    <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">Acer Aspire 5733Z</span>
        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20"></span>
      </div>
      <div className="text-[10px] text-slate-500 font-mono">Pentium P6200 • ~3.5 GiB RAM</div>
      <div className="text-[10px] text-teal-400 font-mono">Tailscale: 100.123.94.61</div>
    </div>
  )

  return (
    <>
      {/* Desktop & Laptop Sidebar */}
      <aside className="w-60 lg:w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between hidden md:flex select-none shrink-0 overflow-y-auto">
        <div className="space-y-4">
          <div className="px-2 py-1 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center p-0.5 border border-indigo-500/30 bg-slate-900/90 shadow-md shadow-indigo-600/15 shrink-0">
              <img src="/icon.svg" alt="NodePilot Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <span className="font-bold tracking-tight text-white block text-sm truncate">NodePilot HSCC</span>
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono block truncate">
                VPS Control Center
              </span>
            </div>
          </div>

          <nav className="space-y-2">
            {sections.map((sec) => renderNavSection(sec, false))}
          </nav>
        </div>

        <div className="pt-4">{hardwareBadge}</div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.fade}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={transition.menu}
              className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 p-4 shadow-2xl flex flex-col justify-between z-10 overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center p-0.5 border border-indigo-500/30 bg-slate-900/90">
                      <img src="/icon.svg" alt="NodePilot Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <span className="font-bold text-white text-sm block">NodePilot HSCC</span>
                      <span className="text-[10px] text-slate-500 uppercase font-mono">Control Center</span>
                    </div>
                  </div>
                  <button
                    onClick={onCloseMobile}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-2">
                  {sections.map((sec) => renderNavSection(sec, true))}
                </nav>
              </div>

              <div className="pt-4">{hardwareBadge}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
