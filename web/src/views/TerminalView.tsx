import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Trash2,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Play,
  CheckCircle2,
  AlertCircle,
  Copy,
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { getAccessToken, buildApiUrl } from '../lib/api'
import { transition, spring } from '../lib/motion'

interface TerminalViewProps {
  isRoot?: boolean
}

export const TerminalView: React.FC<TerminalViewProps> = ({ isRoot = true }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termInstanceRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  const quickSnippets = [
    { label: 'Docker PS', cmd: 'docker ps\n' },
    { label: 'UFW Status', cmd: 'sudo ufw status verbose\n' },
    { label: 'Nginx Test', cmd: 'sudo nginx -t\n' },
    { label: 'Tailscale', cmd: 'tailscale status\n' },
    { label: 'Dung lượng Ổ', cmd: 'df -h /\n' },
    { label: 'Bộ nhớ RAM', cmd: 'free -m\n' },
    { label: 'Tải CPU', cmd: 'top -b -n 1 | head -n 12\n' },
  ]

  const connectTerminal = useCallback(() => {
    if (!terminalRef.current) return

    // Clean up old instance
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (termInstanceRef.current) {
      termInstanceRef.current.dispose()
      termInstanceRef.current = null
    }

    setConnectionStatus('connecting')

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#020617', // bg-slate-950
        foreground: '#e2e8f0', // slate-200
        cursor: '#818cf8',     // indigo-400
        cursorAccent: '#020617',
        selectionBackground: 'rgba(99, 102, 241, 0.35)',
        black: '#0f172a',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#6366f1',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#fb7185',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#818cf8',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    termInstanceRef.current = term
    fitAddonRef.current = fitAddon

    // Build WebSocket URL
    const token = getAccessToken() || ''
    const httpUrl = buildApiUrl(`/ws/terminal?token=${encodeURIComponent(token)}`)
    const wsUrl = httpUrl.startsWith('http://')
      ? httpUrl.replace('http://', 'ws://')
      : httpUrl.startsWith('https://')
      ? httpUrl.replace('https://', 'wss://')
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${httpUrl}`

    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('connected')
      term.focus()
      // Send initial resize
      if (term.cols && term.rows) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(event.data)
        term.write(text)
      }
    }

    ws.onerror = () => {
      setConnectionStatus('disconnected')
    }

    ws.onclose = () => {
      setConnectionStatus('disconnected')
      term.write('\r\n\x1b[31m[Phiên làm việc terminal đã kết thúc hoặc mất kết nối.]\x1b[0m\r\n')
    }

    // Forward user keystrokes to backend shell
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Forward terminal resize
    term.onResize((size) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }))
      }
    })
  }, [])

  useEffect(() => {
    connectTerminal()

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (termInstanceRef.current) {
        termInstanceRef.current.dispose()
      }
    }
  }, [connectTerminal])

  // Fit terminal when fullscreen changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [isFullscreen])

  const sendCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd)
      if (termInstanceRef.current) {
        termInstanceRef.current.focus()
      }
    }
  }

  const handleClear = () => {
    if (termInstanceRef.current) {
      termInstanceRef.current.clear()
    }
  }

  if (!isRoot) {
    return (
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto" />
        <h3 className="text-base font-bold text-slate-100">Truy Cập Bị Giới Hạn</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Web Terminal Console cung cấp quyền shell tương tác trực tiếp tới máy chủ Home Server và chỉ dành riêng cho tài khoản quản trị tối cao (ROOT).
        </p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-slate-950 flex flex-col space-y-3' : ''}`}
    >
      {/* Terminal Header Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <TerminalIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-100">Web Terminal Console</h2>
              {connectionStatus === 'connected' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Trực tuyến
                </span>
              )}
              {connectionStatus === 'connecting' && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Đang kết nối...
                </span>
              )}
              {connectionStatus === 'disconnected' && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-mono flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Mất kết nối
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Phiên tương tác Shell PTY bảo mật trực tiếp trên máy chủ Home Server qua giao thức WebSocket
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={handleClear}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Xóa màn hình terminal"
          >
            <Trash2 className="w-3.5 h-3.5" /> Xóa màn hình
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={connectTerminal}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Kết nối lại terminal"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Kết nối lại
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      {/* Quick Snippets Bar */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2 flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1">
          <Play className="w-3 h-3 text-indigo-400" /> Lệnh nhanh:
        </span>
        <div className="flex items-center space-x-1.5">
          {quickSnippets.map((item) => (
            <button
              key={item.label}
              onClick={() => sendCommand(item.cmd)}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-[11px] transition-colors cursor-pointer shrink-0 border border-slate-700/40"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Screen Container */}
      <div
        className={`bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-2xl relative overflow-hidden ${
          isFullscreen ? 'flex-1' : 'h-[620px]'
        }`}
      >
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </motion.div>
  )
}
