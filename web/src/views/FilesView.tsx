import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileArchive,
  ChevronRight,
  RefreshCw,
  Save,
  X,
  AlertTriangle,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Bookmark as BookmarkIcon,
  HardDrive,
  CornerLeftUp,
  FilePlus,
  FolderPlus,
  Info,
} from 'lucide-react'
import { spring, transition } from '../lib/motion'
import { FileItem, FileContent, Bookmark } from '../types'
import {
  listFiles,
  getFileContent,
  saveFileContent,
  createFolder,
  createFile,
  deletePath,
  renamePath,
  uploadFile,
  downloadFileUrl,
  getFileBookmarks,
} from '../lib/api'

export const FilesView: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>('/home/stephen')
  const [items, setItems] = useState<FileItem[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Manual path input
  const [isEditingPath, setIsEditingPath] = useState(false)
  const [inputPath, setInputPath] = useState('/home/stephen')

  // Code editor modal state
  const [editingFile, setEditingFile] = useState<FileContent | null>(null)
  const [editorContent, setEditorContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // Creation modals
  const [isNewFileOpen, setIsNewFileOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Rename modal
  const [itemToRename, setItemToRename] = useState<FileItem | null>(null)
  const [renameTargetName, setRenameTargetName] = useState('')

  // Delete modal
  const [itemToDelete, setItemToDelete] = useState<FileItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Upload file ref
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listFiles(path)
      setItems(data.items || [])
      setCurrentPath(data.currentPath || path)
      setInputPath(data.currentPath || path)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Không thể tải thư mục'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadBookmarks = async () => {
    try {
      const bm = await getFileBookmarks()
      setBookmarks(bm)
    } catch {
      // Graceful fallback to default bookmarks
      setBookmarks([
        { name: 'Home stephen', path: '/home/stephen', icon: 'home' },
        { name: 'NodePilot Project', path: '/home/stephen/nodepilot', icon: 'project' },
        { name: 'Nginx Configs', path: '/etc/nginx', icon: 'config' },
        { name: 'Web Roots', path: '/var/www', icon: 'web' },
        { name: 'System Logs', path: '/var/log', icon: 'log' },
        { name: 'Root (/)', path: '/', icon: 'root' },
      ])
    }
  }

  useEffect(() => {
    loadDirectory('/home/stephen')
    loadBookmarks()
  }, [loadDirectory])

  const handleOpenFolder = (folderPath: string) => {
    loadDirectory(folderPath)
  }

  const handleGoUp = () => {
    if (currentPath === '/' || currentPath === '.') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length === 0 ? '/' : '/' + parts.join('/')
    loadDirectory(parent)
  }

  const handleOpenFile = async (filePath: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const content = await getFileContent(filePath)
      setEditingFile(content)
      setEditorContent(content.content)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Không thể mở file'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editingFile) return
    setIsSaving(true)
    setError(null)

    try {
      const updated = await saveFileContent(editingFile.relPath, editorContent, editingFile.sha256)
      setEditingFile(updated)
      const fileName = editingFile.relPath.split('/').pop() || editingFile.relPath
      setSuccessMessage(`Đã lưu tệp ${fileName} thành công`)
      setTimeout(() => setSuccessMessage(null), 3000)
      await loadDirectory(currentPath)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Lưu file thất bại'
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFileName.trim()) return
    const fullPath = currentPath === '/' ? `/${newFileName.trim()}` : `${currentPath}/${newFileName.trim()}`
    try {
      await createFile(fullPath)
      setSuccessMessage(`Đã tạo tệp "${newFileName.trim()}"`)
      setIsNewFileOpen(false)
      setNewFileName('')
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi tạo tệp')
    }
  }

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    const fullPath = currentPath === '/' ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`
    try {
      await createFolder(fullPath)
      setSuccessMessage(`Đã tạo thư mục "${newFolderName.trim()}"`)
      setIsNewFolderOpen(false)
      setNewFolderName('')
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi tạo thư mục')
    }
  }

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemToRename || !renameTargetName.trim()) return
    const parentDir = currentPath === '/' ? '' : currentPath
    const newPath = `${parentDir}/${renameTargetName.trim()}`
    try {
      await renamePath(itemToRename.relPath, newPath)
      setSuccessMessage(`Đã đổi tên thành "${renameTargetName.trim()}"`)
      setItemToRename(null)
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi đổi tên')
    }
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    setIsDeleting(true)
    setError(null)
    try {
      await deletePath(itemToDelete.relPath)
      setSuccessMessage(`Đã xóa "${itemToDelete.name}"`)
      setItemToDelete(null)
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi xóa tệp/thư mục')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setError(null)
    try {
      await uploadFile(currentPath, file)
      setSuccessMessage(`Đã tải lên tệp "${file.name}"`)
      await loadDirectory(currentPath)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi tải tệp lên')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KiB', 'MiB', 'GiB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  const getFileIcon = (item: FileItem) => {
    if (item.isDir) {
      return <Folder className="w-4 h-4 text-amber-400 shrink-0" />
    }
    const ext = item.name.split('.').pop()?.toLowerCase()
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml', 'conf', 'sh', 'py', 'go'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-teal-400 shrink-0" />
    }
    if (['zip', 'tar', 'gz', 'bz2', 'xz'].includes(ext || '')) {
      return <FileArchive className="w-4 h-4 text-purple-400 shrink-0" />
    }
    return <FileText className="w-4 h-4 text-slate-400 shrink-0" />
  }

  // Parse path breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <FolderOpen className="w-6 h-6 text-indigo-400" />
            <span>Trình duyệt Tệp & Cấu trúc Dự án (VPS Explorer)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Khám phá toàn bộ cấu trúc thư mục máy chủ, chỉnh sửa mã nguồn trực tiếp và quản lý tệp tin từ xa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFileChange}
            className="hidden"
          />

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
          >
            <Upload className={`w-3.5 h-3.5 text-teal-400 ${isUploading ? 'animate-bounce' : ''}`} />
            <span>{isUploading ? 'Đang tải lên...' : 'Tải lên tệp'}</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => setIsNewFolderOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>Thư mục mới</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => setIsNewFileOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20 transition-colors"
          >
            <FilePlus className="w-4 h-4" />
            <span>Tệp mới</span>
          </motion.button>
        </div>
      </div>

      {/* Bookmarks Chips */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 flex items-center space-x-1 shrink-0 font-medium">
          <BookmarkIcon className="w-3.5 h-3.5 text-indigo-400" />
          <span>Lối tắt:</span>
        </span>
        {bookmarks.map((bm) => (
          <button
            key={bm.path}
            onClick={() => loadDirectory(bm.path)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer shrink-0 transition-colors font-mono flex items-center space-x-1.5 ${
              currentPath === bm.path
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span>{bm.name}</span>
          </button>
        ))}
      </div>

      {/* Notification Banners */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:text-rose-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="p-1 hover:text-emerald-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breadcrumb Navigation Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <button
            onClick={handleGoUp}
            disabled={currentPath === '/' || currentPath === '.'}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 rounded-lg cursor-pointer transition-colors shrink-0"
            title="Lên một cấp thư mục"
          >
            <CornerLeftUp className="w-4 h-4" />
          </button>

          {isEditingPath ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setIsEditingPath(false)
                loadDirectory(inputPath.trim() || '/')
              }}
              className="flex-1 flex items-center space-x-2"
            >
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                autoFocus
                onBlur={() => setIsEditingPath(false)}
                className="w-full px-3 py-1 bg-slate-950 border border-indigo-500 rounded-lg text-xs text-white font-mono focus:outline-none"
              />
            </form>
          ) : (
            <div
              onClick={() => setIsEditingPath(true)}
              className="flex items-center space-x-1.5 text-xs font-mono text-slate-300 overflow-x-auto py-1 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer flex-1"
              title="Bấm để nhập đường dẫn trực tiếp"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  loadDirectory('/')
                }}
                className="hover:text-indigo-400 transition-colors font-semibold"
              >
                /
              </button>
              {pathParts.map((part, idx) => {
                const subPath = '/' + pathParts.slice(0, idx + 1).join('/')
                const isLast = idx === pathParts.length - 1
                return (
                  <React.Fragment key={subPath}>
                    <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        loadDirectory(subPath)
                      }}
                      className={`hover:text-indigo-400 transition-colors ${
                        isLast ? 'text-indigo-300 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={spring.press}
          onClick={() => loadDirectory(currentPath)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors shrink-0"
          title="Làm mới thư mục"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
        </motion.button>
      </div>

      {/* File & Directory Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
            <span>Đang quét tệp và thư mục...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span>Thư mục trống</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tên tệp / thư mục</th>
                  <th className="py-3 px-4">Kích thước</th>
                  <th className="py-3 px-4">Quyền (Mode)</th>
                  <th className="py-3 px-4">Chủ sở hữu</th>
                  <th className="py-3 px-4">Sửa đổi lần cuối</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {items.map((item) => (
                  <tr
                    key={item.name}
                    className="hover:bg-slate-800/30 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (item.isDir) {
                        handleOpenFolder(item.relPath)
                      } else {
                        handleOpenFile(item.relPath)
                      }
                    }}
                  >
                    <td className="py-2.5 px-4 font-mono font-medium text-white flex items-center space-x-2.5">
                      {getFileIcon(item)}
                      <span className="truncate group-hover:text-indigo-300 transition-colors">
                        {item.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">
                      {item.isDir ? <span className="text-slate-600">—</span> : formatBytes(item.size)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                      {item.mode || '-rw-r--r--'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                      {item.owner || 'stephen:stephen'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                      {item.modTime ? new Date(item.modTime).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-1">
                        {!item.isDir && (
                          <>
                            <button
                              onClick={() => handleOpenFile(item.relPath)}
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Sửa tệp"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={downloadFileUrl(item.relPath)}
                              download={item.name}
                              className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Tải về máy"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setItemToRename(item)
                            setRenameTargetName(item.name)
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Đổi tên"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {editingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    <span>Chỉnh sửa: {editingFile.name || editingFile.relPath.split('/').pop()}</span>
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">{editingFile.relPath}</span>
                </div>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex-1 flex flex-col min-h-0">
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  rows={20}
                  className="w-full flex-1 p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500 resize-none font-normal leading-relaxed"
                  spellCheck={false}
                />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500 font-mono">
                  Dung lượng: {formatBytes(editingFile.size)} • SHA256:{' '}
                  {editingFile.sha256 ? editingFile.sha256.substring(0, 12) + '...' : 'none'}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingFile(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    {isSaving ? 'Đang lưu...' : 'Lưu tệp'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New File Modal */}
      <AnimatePresence>
        {isNewFileOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <FilePlus className="w-4 h-4 text-indigo-400" />
                  <span>Tạo tệp mới</span>
                </h3>
                <button
                  onClick={() => setIsNewFileOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewFile} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tên tệp</label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: config.json, main.go"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewFileOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    Tạo tệp
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Folder Modal */}
      <AnimatePresence>
        {isNewFolderOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <FolderPlus className="w-4 h-4 text-amber-400" />
                  <span>Tạo thư mục mới</span>
                </h3>
                <button
                  onClick={() => setIsNewFolderOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewFolder} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tên thư mục</label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: my-project, backups"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewFolderOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-amber-600/20"
                  >
                    Tạo thư mục
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {itemToRename && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Edit2 className="w-4 h-4 text-amber-400" />
                  <span>Đổi tên: {itemToRename.name}</span>
                </h3>
                <button
                  onClick={() => setItemToRename(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRename} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tên mới</label>
                  <input
                    type="text"
                    required
                    value={renameTargetName}
                    onChange={(e) => setRenameTargetName(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setItemToRename(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-amber-600/20"
                  >
                    Lưu tên mới
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white text-center">
                Xóa {itemToDelete.isDir ? 'thư mục' : 'tệp'} "{itemToDelete.name}"?
              </h3>
              <p className="text-xs text-slate-400 text-center mt-1.5 font-mono">
                {itemToDelete.relPath}
              </p>
              <p className="text-[11px] text-rose-400/80 text-center mt-1">
                {itemToDelete.isDir
                  ? 'Toàn bộ nội dung bên trong thư mục này sẽ bị xóa vĩnh viễn!'
                  : 'Hành động này không thể hoàn tác!'}
              </p>

              <div className="mt-5 flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
