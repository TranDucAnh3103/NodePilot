import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface StaleBannerProps {
  isStale: boolean
}

export const StaleBanner: React.FC<StaleBannerProps> = ({ isStale }) => {
  if (!isStale) return null

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between text-amber-300 text-xs animate-pulse">
      <div className="flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Mất kết nối máy chủ:</strong> Đang hiển thị dữ liệu lưu đệm gần nhất. Hệ thống đang tự động kết nối lại qua WebSocket...
        </span>
      </div>
      <div className="flex items-center space-x-1.5 text-amber-400">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="font-mono text-[11px]">Đang thử lại</span>
      </div>
    </div>
  )
}
