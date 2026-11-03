import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Globe,
  Server,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Play,
  RotateCw,
  Edit3,
  Trash2,
  FileCode,
  Check,
  X,
  ExternalLink,
  Code2,
  Power,
  ShieldCheck,
} from 'lucide-react'
import { NginxStatus, NginxSite } from '../types'
import {
  getNginxStatus,
  getNginxSites,
  getNginxSiteContent,
  saveNginxSiteContent,
  toggleNginxSite,
  deleteNginxSite,
  testNginxConfig,
  reloadNginx,
} from '../lib/api'
import { spring, transition } from '../lib/motion'

export const NginxView: React.FC = () => {
  const [status, setStatus] = useState<NginxStatus | null>(null)
  const [sites, setSites] = useState<NginxSite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Syntax test modal
  const [isTestModalOpen, setIsTestModalOpen] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; output: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  // Reloading
  const [isReloading, setIsReloading] = useState(false)

  // Edit config modal
  const [editingSite, setEditingSite] = useState<NginxSite | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Create new site modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newUpstreamPort, setNewUpstreamPort] = useState('3000')
  const [newListenPort, setNewListenPort] = useState('80')
  const [templateType, setTemplateType] = useState<'proxy' | 'static'>('proxy')

  // Delete confirmation modal
  const [siteToDelete, setSiteToDelete] = useState<NginxSite | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statusData, sitesData] = await Promise.all([getNginxStatus(), getNginxSites()])
      setStatus(statusData)
      setSites(sitesData || [])
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Không thể tải dữ liệu Nginx')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleTestSyntax = async () => {
    setIsTesting(true)
    try {
      const res = await testNginxConfig()
      setTestResult(res)
      setIsTestModalOpen(true)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi kiểm tra cú pháp Nginx')
    } finally {
      setIsTesting(false)
    }
  }

  const handleReload = async () => {
    setIsReloading(true)
    setError(null)
    try {
      await reloadNginx()
      setActionSuccess('Đã tải lại cấu hình Nginx (systemctl reload nginx) thành công!')
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi tải lại Nginx')
    } finally {
      setIsReloading(false)
    }
  }

  const handleToggle = async (site: NginxSite) => {
    try {
      await toggleNginxSite(site.name, !site.enabled)
      setActionSuccess(`Đã ${!site.enabled ? 'kích hoạt' : 'vô hiệu hóa'} Virtual Host "${site.name}"`)
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi chuyển trạng thái site')
    }
  }

  const handleOpenEdit = async (site: NginxSite) => {
    setEditingSite(site)
    setIsLoadingContent(true)
    try {
      const res = await getNginxSiteContent(site.name)
      setEditorContent(res.content)
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Không thể đọc nội dung cấu hình')
      setEditingSite(null)
    } finally {
      setIsLoadingContent(false)
    }
  }

  const handleSaveContent = async () => {
    if (!editingSite) return
    setIsSaving(true)
    setError(null)
    try {
      await saveNginxSiteContent(editingSite.name, editorContent)
      setActionSuccess(`Đã lưu cấu hình "${editingSite.name}". Nhớ Tải lại Nginx để áp dụng!`)
      setEditingSite(null)
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi lưu cấu hình')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault()
    let safeName = newSiteName.trim()
    if (!safeName.endsWith('.conf')) {
      safeName += '.conf'
    }

    let generatedContent = ''
    if (templateType === 'proxy') {
      generatedContent = `server {
    listen ${newListenPort};
    listen [::]:${newListenPort};

    server_name ${newDomain.trim() || '_'};

    location / {
        proxy_pass http://127.0.0.1:${newUpstreamPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`
    } else {
      generatedContent = `server {
    listen ${newListenPort};
    listen [::]:${newListenPort};

    server_name ${newDomain.trim() || '_'};
    root /var/www/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }
}
`
    }

    try {
      await saveNginxSiteContent(safeName, generatedContent)
      setActionSuccess(`Đã tạo Virtual Host "${safeName}" thành công`)
      setIsCreateOpen(false)
      setNewSiteName('')
      setNewDomain('')
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi tạo Virtual Host')
    }
  }

  const handleDelete = async () => {
    if (!siteToDelete) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteNginxSite(siteToDelete.name)
      setActionSuccess(`Đã xóa Virtual Host "${siteToDelete.name}"`)
      setSiteToDelete(null)
      await loadData()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Lỗi khi xóa Virtual Host')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <Globe className="w-6 h-6 text-teal-400" />
            <span>Máy chủ Web & Reverse Proxy (Nginx)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Quản lý Virtual Hosts, cấu hình Reverse Proxy chuyển tiếp cổng và định tuyến domain.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={handleTestSyntax}
            disabled={isTesting}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isTesting ? 'Đang test...' : 'Kiểm tra cú pháp (nginx -t)'}</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-teal-600/20 border border-teal-500/30 hover:bg-teal-600/30 text-teal-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
            <span>Tải lại Nginx (Reload)</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring.press}
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-indigo-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Virtual Host mới</span>
          </motion.button>
        </div>
      </div>

      {/* Notifications */}
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

        {actionSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="p-1 hover:text-emerald-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Nginx Service Status */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Trạng thái Dịch vụ</div>
            <div className="mt-1 flex items-center space-x-2">
              {status?.active ? (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>ĐANG CHẠY (ACTIVE)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span>ĐÃ DỪNG (STOPPED)</span>
                </span>
              )}
            </div>
          </div>
          <Server className="w-6 h-6 text-teal-400 opacity-60" />
        </div>

        {/* Nginx Version */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium">Phiên bản Nginx</div>
          <div className="mt-1 font-mono text-sm font-semibold text-slate-200 truncate">
            {status?.version || 'Nginx (System)'}
          </div>
        </div>

        {/* Total Sites */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium">Virtual Hosts đã tạo</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{sites.length}</div>
        </div>

        {/* Enabled Sites */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
          <div className="text-xs text-slate-400 font-medium">Đang kích hoạt (Enabled)</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
            {sites.filter((s) => s.enabled).length}
          </div>
        </div>
      </div>

      {/* Sites List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-semibold text-white">Danh sách Virtual Hosts (/etc/nginx/sites-available)</h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">{sites.length} cấu hình</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 text-teal-400 animate-spin" />
            <span>Đang tải danh sách Virtual Hosts...</span>
          </div>
        ) : sites.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <FileCode className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span>Chưa có Virtual Host nào. Hãy thêm một cấu hình để bắt đầu định tuyến tên miền.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tên cấu hình</th>
                  <th className="py-3 px-4">Tên miền (Server Name)</th>
                  <th className="py-3 px-4">Cổng lắng nghe</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {sites.map((site) => (
                  <tr key={site.name} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-white flex items-center space-x-2">
                      <FileCode className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>{site.name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {site.serverName || <span className="text-slate-600">_ (mặc định)</span>}
                    </td>
                    <td className="py-3 px-4 font-mono text-indigo-400">
                      {site.listenPort || <span className="text-slate-600">80</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggle(site)}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border transition-colors ${
                          site.enabled
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                        }`}
                        title="Bấm để bật/tắt liên kết sites-enabled"
                      >
                        <Power className="w-3 h-3" />
                        <span>{site.enabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenEdit(site)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Sửa cấu hình"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSiteToDelete(site)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Xóa cấu hình"
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

      {/* Syntax Test Result Modal */}
      <AnimatePresence>
        {isTestModalOpen && testResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Kết quả kiểm tra cú pháp (nginx -t)</span>
                </h3>
                <button
                  onClick={() => setIsTestModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
                    testResult.success
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Cú pháp Nginx hợp lệ (syntax is ok / test is successful).</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Cú pháp Nginx bị lỗi! Vui lòng kiểm tra lại cấu hình.</span>
                    </>
                  )}
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                    Output chi tiết từ hệ thống:
                  </label>
                  <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-60">
                    {testResult.output}
                  </pre>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Config Modal */}
      <AnimatePresence>
        {editingSite && (
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
                    <Code2 className="w-4 h-4 text-teal-400" />
                    <span>Sửa cấu hình: {editingSite.name}</span>
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    /etc/nginx/sites-available/{editingSite.name}
                  </span>
                </div>
                <button
                  onClick={() => setEditingSite(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex-1 flex flex-col min-h-0">
                {isLoadingContent ? (
                  <div className="py-20 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-5 h-5 text-teal-400 animate-spin" />
                    <span>Đang tải nội dung tệp...</span>
                  </div>
                ) : (
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    rows={18}
                    className="w-full flex-1 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 focus:outline-none focus:border-teal-500 resize-none font-normal leading-relaxed"
                    spellCheck={false}
                  />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500">
                  Lưu xong, hãy bấm "Kiểm tra cú pháp" và "Tải lại Nginx" để áp dụng.
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingSite(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || isLoadingContent}
                    onClick={handleSaveContent}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-teal-600/20"
                  >
                    {isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create New Site Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.dialog}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-teal-400" />
                  <span>Tạo Virtual Host Nginx mới</span>
                </h3>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSite} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tên cấu hình tệp <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: myapp.conf"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Loại mẫu cấu hình</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateType('proxy')}
                      className={`p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                        templateType === 'proxy'
                          ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Reverse Proxy (Node/Python)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateType('static')}
                      className={`p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                        templateType === 'static'
                          ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Static Site (/var/www/html)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Cổng lắng nghe</label>
                    <input
                      type="text"
                      value={newListenPort}
                      onChange={(e) => setNewListenPort(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                  {templateType === 'proxy' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">Upstream Port</label>
                      <input
                        type="text"
                        value={newUpstreamPort}
                        onChange={(e) => setNewUpstreamPort(e.target.value)}
                        placeholder="3000, 8080"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tên miền (Server Name)
                  </label>
                  <input
                    type="text"
                    placeholder="ví dụ: app.mydomain.com hoặc _ (mặc định)"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-teal-600/20"
                  >
                    Tạo Virtual Host
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {siteToDelete && (
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
                Xóa Virtual Host "{siteToDelete.name}"?
              </h3>
              <p className="text-xs text-slate-400 text-center mt-1.5">
                Tệp cấu hình trong <span className="font-mono text-slate-300">sites-available</span> và liên kết trong{' '}
                <span className="font-mono text-slate-300">sites-enabled</span> sẽ bị xóa vĩnh viễn.
              </p>

              <div className="mt-5 flex items-center justify-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSiteToDelete(null)}
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
