import React from 'react'
import { motion } from 'motion/react'
import { User as UserIcon, LogOut, ShieldCheck, Wifi, RefreshCw, ArrowUpCircle, Menu, X } from 'lucide-react'
import { User } from '../types'
import { spring } from '../lib/motion'

interface NavbarProps {
  user: User | null
  hostname: string
  isStale: boolean
  hasUpdate?: boolean
  isCheckingUpdate?: boolean
  isMobileMenuOpen?: boolean
  onToggleMobileMenu?: () => void
  onOpenUpdateModal?: () => void
  onLogout: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hostname,
  isStale,
  hasUpdate = false,
  isCheckingUpdate = false,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
  onOpenUpdateModal,
  onLogout,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40 select-none">
      <div className="flex items-center space-x-2 sm:space-x-3.5">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Toggle Navigation Menu"
            className="p-2 -ml-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-xl md:hidden transition-colors cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-indigo-400" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center p-0.5 border border-indigo-500/25 bg-slate-900/90 shadow-md shadow-indigo-600/10">
          <img src="/icon.svg" alt="NodePilot Logo" className="w-full h-full object-contain" />
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-100 text-xs sm:text-sm tracking-tight truncate max-w-[120px] sm:max-w-none">
              {hostname || 'Home Server'}
            </span>
            <span className="flex h-2 w-2 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isStale ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isStale ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              ></span>
            </span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-400">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>Tailscale Mesh Network</span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {onOpenUpdateModal && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            transition={spring.press}
            onClick={onOpenUpdateModal}
            className={`flex items-center space-x-1.5 py-1.5 px-2.5 sm:px-3 rounded-full text-xs font-medium cursor-pointer transition-colors border ${
              hasUpdate
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:text-white'
            }`}
            title="Quét phiên bản mới từ Git"
          >
            {hasUpdate ? (
              <>
                <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span className="font-semibold hidden xs:inline sm:inline">Có bản mới</span>
              </>
            ) : (
              <>
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Cập nhật</span>
              </>
            )}
          </motion.button>
        )}

        {user && (() => {
          const isRoot =
            user.role === 'root' ||
            user.username === 'stephen3103' ||
            user.username === 'tranducanh31032006@gmail.com'
          return (
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-800/60 py-1 sm:py-1.5 px-2 sm:px-3 rounded-full border border-slate-700/60">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-200 hidden sm:inline max-w-[100px] truncate">
                {user.username}
              </span>
              {isRoot ? (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  ROOT
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3 h-3" />
                  {user.role}
                </span>
              )}
            </div>
          )
        })()}

        <motion.button
          whileTap={{ scale: 0.92 }}
          transition={spring.press}
          onClick={onLogout}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
          title="Đăng xuất"
        >
          <LogOut className="w-4 h-4" />
        </motion.button>
      </div>
    </header>
  )
}
