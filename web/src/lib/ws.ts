import { HostSnapshot } from '../types'
import { getAccessToken, refreshToken } from './api'

type SnapshotCallback = (snapshot: HostSnapshot) => void
type StaleCallback = (stale: boolean) => void

export class MetricsWebSocketClient {
  private ws: WebSocket | null = null
  private onSnapshot: SnapshotCallback
  private onStale: StaleCallback
  private isIntentionalClose = false
  private retryDelay = 1000
  private maxRetryDelay = 10000
  private reconnectTimer: number | null = null

  constructor(onSnapshot: SnapshotCallback, onStale: StaleCallback) {
    this.onSnapshot = onSnapshot
    this.onStale = onStale
  }

  public connect() {
    this.isIntentionalClose = false

    const token = getAccessToken()
    if (!token) {
      this.onStale(true)
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/metrics`

    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      // Step 1: Send Auth First Message
      const currentToken = getAccessToken()
      if (currentToken && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'auth', accessToken: currentToken }))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'auth.ok') {
          this.retryDelay = 1000 // Reset backoff
          this.onStale(false)
        } else if (msg.type === 'metrics.snapshot') {
          this.onStale(false)
          this.onSnapshot(msg.payload)
        } else if (msg.type === 'error' && msg.code === 'TOKEN_INVALID') {
          // Token expired, attempt refresh then reconnect
          refreshToken().then(() => this.connect()).catch(() => this.onStale(true))
        }
      } catch {
        // Invalid payload
      }
    }

    this.ws.onclose = () => {
      this.onStale(true)
      if (!this.isIntentionalClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.onStale(true)
      this.ws?.close()
    }
  }

  public disconnect() {
    this.isIntentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = window.setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay)
      this.connect()
    }, this.retryDelay)
  }
}
