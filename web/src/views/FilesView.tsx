import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Folder,
  FileText,
  ChevronRight,
  RefreshCw,
  Save,
  X,
  AlertTriangle,
  ShieldCheck,
  Check,
  FolderOpen,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { FileItem, FileContent } from '../types'
import { listFiles, getFileContent, saveFileContent } from '../lib/api'

export const FilesView: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('.')
  const [items, setItems] = useState<FileItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Editor modal state
  const [editingFile, setEditingFile] = useState<FileContent | null>(null)
  const [editorContent, setEditorContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listFiles(path)
      setItems(data)
      setCurrentPath(path)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải thư mục'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDirectory('.')
  }, [loadDirectory])

  const handleOpenFolder = (folderPath: string) => {
    loadDirectory(folderPath)
  }

  const handleOpenFile = async (filePath: string) => {
    setIsLoading(true)
    setSaveError(null)
    try {
      const content = await getFileContent(filePath)
      setEditingFile(content)
      setEditorContent(content.content)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể mở file'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editingFile) return
    setIsSaving(true)
    setSaveError(null)

    try {
      const updated = await saveFileContent(editingFile.relPath, editorContent, editingFile.sha256)
      setEditingFile(updated)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
      await loadDirectory(currentPath)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lưu file thất bại'
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KiB', 'MiB', 'GiB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  // Split path for breadcrumbs
  const pathParts = currentPath === '.' ? [] : currentPath.split('/')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.fade}
      className="space-y-6"
    >
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-100">Quản Lý Tệp Sandbox (Managed Roots)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Chỉ cho phép xem và sửa các file cấu hình trong thư mục sandbox được chỉ định. Chặn 100% Path Traversal ra ngoài hệ thống.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Sandbox Cô Lập
          </span>
          <button
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-3 text-xs text-rose-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Breadcrumb Navigation Bar */}
      <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center space-x-1.5 text-xs font-mono overflow-x-auto">
        <button
          onClick={() => loadDirectory('.')}
          className="hover:text-indigo-400 text-slate-300 cursor-pointer font-bold px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
        >
          managed:root
        </button>

        {pathParts.map((part, index) => {
          const subPath = pathParts.slice(0, index + 1).join('/')
          return (
            <React.Fragment key={subPath}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <button
                onClick={() => loadDirectory(subPath)}
                className="hover:text-indigo-400 text-slate-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {part}
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {/* Directory Listing Table */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Tên tệp / Thư mục</th>
                <th className="py-3 px-4">Kích thước</th>
                <th className="py-3 px-4">Ngày cập nhật</th>
                <th className="py-3 px-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {currentPath !== '.' && (
                <tr
                  onClick={() => {
                    const up = pathParts.slice(0, -1).join('/') || '.'
                    loadDirectory(up)
                  }}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td colSpan={4} className="py-3 px-4 font-mono text-indigo-400 font-bold">
                    .. (Thư mục cấp trên)
                  </td>
                </tr>
              )}

              {items.map((item) => (
                <tr
                  key={item.relPath}
                  onClick={() => {
                    if (item.isDir) {
                      handleOpenFolder(item.relPath)
                    } else {
                      handleOpenFile(item.relPath)
                    }
                  }}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono font-medium text-slate-200">
                    <div className="flex items-center space-x-2.5">
                      {item.isDir ? (
                        <Folder className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {item.isDir ? '-' : formatBytes(item.size)}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(item.modTime).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-slate-500 hover:text-indigo-400 text-xs font-mono">
                      {item.isDir ? 'Mở' : 'Chỉnh sửa'}
                    </span>
                  </td>
                </tr>
              ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-500 text-xs">
                    Thư mục hiện tại đang trống.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Text Editor Modal */}
      {editingFile && (
        <AnimatePresence>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.overlay}
              onClick={() => setEditingFile(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={spring.dialog}
              className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">{editingFile.relPath}</h3>
                    <p className="text-xs text-slate-400 font-mono">SHA256: {editingFile.sha256.substring(0, 16)}...</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={spring.press}
                    disabled={isSaving}
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : saveSuccess ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{saveSuccess ? 'Đã lưu!' : 'Lưu tệp'}</span>
                  </motion.button>

                  <button
                    onClick={() => setEditingFile(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-400 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Editor textarea */}
              <div className="flex-1 p-3 bg-slate-950 font-mono text-xs text-slate-200 overflow-y-auto">
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="w-full h-full min-h-[350px] bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed selection:bg-indigo-500 selection:text-white"
                  spellCheck={false}
                />
              </div>

              {/* Footer notice */}
              <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Ghi file nguyên tử (Atomic Write) • Tự động tạo bản backup trước khi ghi</span>
                <span>Kích thước: {formatBytes(editorContent.length)}</span>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>
      )}
    </motion.div>
  )
}
