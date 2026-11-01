import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, X } from 'lucide-react'
import { User, HostSnapshot, UpdateCheckResult, Alert } from './types'
import { getMe, refreshToken, logout, checkUpdate, getAlerts } from './lib/api'
import { MetricsWebSocketClient } from './lib/ws'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { StaleBanner } from './components/StaleBanner'
import { UpdateModal } from './components/UpdateModal'
import { LoginView } from './views/LoginView'
import { OverviewView } from './views/OverviewView'
import { WorkloadsView } from './views/WorkloadsView'
import { ServicesView } from './views/ServicesView'
import { TasksView } from './views/TasksView'
import { FilesView } from './views/FilesView'
import { ProcessesView } from './views/ProcessesView'
import { AuditView } from './views/AuditView'
import { SettingsView } from './views/SettingsView'
import { transition } from './lib/motion'

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [currentTab, setCurrentTab] = useState('overview')
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null)
  const [isStale, setIsStale] = useState(false)

  // Real-time active alerts banner
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([])

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

  // 2. Initial update check & active alerts when authenticated
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
      getAlerts()
        .then((res) => setActiveAlerts(res.active || []))
        .catch(() => {})
    }
  }, [currentUser])

  // 3. Setup WebSocket when user is logged in with hibernation & alerts
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
      const cpuVal = (snap.cpu && snap.cpu.usagePercent !== null) ? snap.cpu.usagePercent : 0
      setCpuHistory((prev) => {
        const next = [...prev, { time: timeLabel, value: cpuVal }]
        return next.length > 60 ? next.slice(next.length - 60) : next
      })

      // Update Network history (sum of all rx/tx in KB/s)
      const networks = snap.networks || []
      const totalRxBytes = networks.reduce((acc, n) => acc + (n.rxBytesPerSec || 0), 0)
      const totalTxBytes = networks.reduce((acc, n) => acc + (n.txBytesPerSec || 0), 0)

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

    const onAlert = (alert: Alert) => {
      setActiveAlerts((prev) => {
        const filtered = prev.filter((a) => a.key !== alert.key)
        return alert.active ? [alert, ...filtered] : filtered
      })
    }

    const client = new MetricsWebSocketClient(onSnapshot, onStale, onAlert)
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
    setActiveAlerts([])
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

      {/* Active System Alerts Banner */}
      {(activeAlerts || []).length > 0 && activeAlerts[0] && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center space-x-2.5 overflow-x-auto">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span className="font-bold">Cảnh báo tài nguyên:</span>
            <span>{activeAlerts[0].title} — {activeAlerts[0].message}</span>
            {activeAlerts.length > 1 && (
              <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                +{activeAlerts.length - 1} cảnh báo khác
              </span>
            )}
          </div>
          <button
            onClick={() => setActiveAlerts([])}
            className="p-1 text-amber-400 hover:text-amber-200 cursor-pointer"
            title="Ẩn thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <StaleBanner isStale={isStale} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} currentUser={currentUser} />

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
                {currentTab === 'processes' && <ProcessesView />}
                {currentTab === 'tasks' && <TasksView />}
                {currentTab === 'files' && <FilesView />}
                {currentTab === 'audit' && <AuditView />}
                {currentTab === 'settings' && <SettingsView currentUser={currentUser} />}
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
