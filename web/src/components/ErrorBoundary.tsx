import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 select-none">
          <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">Đã xảy ra sự cố hiển thị</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Giao diện gặp lỗi xử lý dữ liệu. Vui lòng thử tải lại trang hoặc kiểm tra kết nối tới máy chủ.
            </p>
            {this.state.error && (
              <pre className="text-[11px] font-mono text-rose-300 bg-slate-950 p-3 rounded-xl border border-slate-800 mb-6 text-left overflow-x-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại bảng điều khiển</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
