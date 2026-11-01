import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { User, HostSnapshot, UpdateCheckResult } from './types'
import { getMe, refreshToken, logout, checkUpdate } from './lib/api'
import { MetricsWebSocketClient } from './lib/ws'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { StaleBanner } from './components/StaleBanner'
import { UpdateModal } from './components/UpdateModal'
import { LoginView } from './views/LoginView'
import { OverviewView } from './views/OverviewView'
import { WorkloadsView } from './views/WorkloadsView'
import { ServicesView } from './views/ServicesView'
import { AuditView } from './views/AuditView'
import { SettingsView } from './views/SettingsView'
import { transition } from './lib/motion'

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [currentTab, setCurrentTab] = useState('overview')
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null)
  const [isStale, setIsStale] = useState(false)

  // Update management state
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)

  // In-memory histories for ECharts (up to 60 points)
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string; value: number }>>([])
  const [netHistory, setNetHistory] = useState<Array<{ time: string; rxKB: number; txKB: number }>>([])

  const wsClientRef = useRef<MetricsWebSocketClient | null>(null)

  // 1. Initial auth check
  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshToken()
        const user = await getMe()
        setCurrentUser(user)
      } catch {
        // Not authenticated yet
        setCurrentUser(null)
      } finally {
        setIsInitializing(false)
      }
    }
    initAuth()
  }, [])

  // 2. Initial update check when authenticated
  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true)
    try {
      const res = await checkUpdate()
      setUpdateInfo(res)
    } catch {
      // Graceful fallback
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  useEffect(() => {
    if (currentUser) {
      handleCheckUpdate()
    }
  }, [currentUser])

  // 3. Setup WebSocket when user is logged in
  useEffect(() => {
    if (!currentUser) {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
        wsClientRef.current = null
      }
      return
    }

    const onSnapshot = (snap: HostSnapshot) => {
      setSnapshot(snap)

      const timeLabel = new Date(snap.capturedAt).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      // Update CPU history (max 60 points)
      const cpuVal = snap.cpu.usagePercent !== null ? snap.cpu.usagePercent : 0
      setCpuHistory((prev) => {
        const next = [...prev, { time: timeLabel, value: cpuVal }]
        return next.length > 60 ? next.slice(next.length - 60) : next
      })

      // Update Network history (sum of all rx/tx in KB/s)
      const totalRxBytes = snap.networks.reduce((acc, n) => acc + n.rxBytesPerSec, 0)
      const totalTxBytes = snap.networks.reduce((acc, n) => acc + n.txBytesPerSec, 0)

      setNetHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            rxKB: Math.round(totalRxBytes / 1024),
            txKB: Math.round(totalTxBytes / 1024),
          },
        ]
        return next.length > 60 ? next.slice(next.length - 60) : next
      })
    }

    const onStale = (stale: boolean) => {
      setIsStale(stale)
    }

    const client = new MetricsWebSocketClient(onSnapshot, onStale)
    client.connect()
    wsClientRef.current = client

    return () => {
      client.disconnect()
    }
  }, [currentUser])

  const handleLogout = async () => {
    await logout()
    setCurrentUser(null)
    setSnapshot(null)
    setCpuHistory([])
    setNetHistory([])
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(user) => setCurrentUser(user)} />
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
      <Navbar
        user={currentUser}
        hostname={snapshot?.host.hostname || 'homeserver'}
        isStale={isStale}
        hasUpdate={updateInfo?.hasUpdate}
        isCheckingUpdate={isCheckingUpdate}
        onOpenUpdateModal={() => {
          setIsUpdateModalOpen(true)
          if (!updateInfo) handleCheckUpdate()
        }}
        onLogout={handleLogout}
      />

      <StaleBanner isStale={isStale} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={transition.fade}
              >
                {currentTab === 'overview' && (
                  <OverviewView
                    snapshot={snapshot}
                    cpuHistory={cpuHistory}
                    netHistory={netHistory}
                  />
                )}
                {currentTab === 'system' && (
                  <OverviewView
                    snapshot={snapshot}
                    cpuHistory={cpuHistory}
                    netHistory={netHistory}
                  />
                )}
                {currentTab === 'docker' && <WorkloadsView />}
                {currentTab === 'services' && <ServicesView />}
                {currentTab === 'tasks' && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
                    <div className="text-sm font-semibold text-slate-200">
                      Tác vụ định sẵn (Cron & Systemd Timers)
                    </div>
                    <p className="text-xs text-slate-500">
                      Bộ máy lập lịch sao lưu và bảo trì tự động đang giám sát 4 cron jobs của máy chủ.
                    </p>
                  </div>
                )}
                {currentTab === 'audit' && <AuditView />}
                {currentTab === 'settings' && <SettingsView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Zero-Command Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        updateInfo={updateInfo}
        isChecking={isCheckingUpdate}
        onClose={() => setIsUpdateModalOpen(false)}
        onCheckAgain={handleCheckUpdate}
      />
    </div>
  )
}
