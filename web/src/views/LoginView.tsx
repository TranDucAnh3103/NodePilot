import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Server,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  Loader2,
  Mail,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { login, sendOTP, verifyOTP } from '../lib/api'
import { User as UserType } from '../types'
import { spring, transition } from '../lib/motion'

interface LoginViewProps {
  onLoginSuccess: (user: UserType) => void
}

type AuthMode = 'password' | 'otp'

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('password')

  // Password Login state
  const [username, setUsername] = useState('stephen3103')
  const [password, setPassword] = useState('')

  // Gmail OTP Login state
  const [email, setEmail] = useState('tranducanh31032006@gmail.com')
  const [otpCode, setOtpCode] = useState('')
  const [isOtpSent, setIsOtpSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Countdown timer for resending OTP
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // Handle Password Submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return

    setIsLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const data = await login(username.trim(), password)
      onLoginSuccess(data.user)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message)
      } else {
        setErrorMsg('Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản hoặc mật khẩu.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Send OTP
  const handleSendOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!email.trim() || countdown > 0) return

    setIsLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await sendOTP(email.trim())
      setIsOtpSent(true)
      setCountdown(60)
      setSuccessMsg(res.message || 'Mã OTP đã được gửi tới email của bạn.')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message)
      } else {
        setErrorMsg('Gửi mã OTP thất bại. Email có thể không nằm trong danh sách cho phép.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !otpCode.trim()) return

    setIsLoading(true)
    setErrorMsg(null)

    try {
      const data = await verifyOTP(email.trim(), otpCode.trim())
      onLoginSuccess(data.user)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message)
      } else {
        setErrorMsg('Mã OTP không chính xác hoặc đã hết hạn.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -top-32 -left-32"></div>
      <div className="absolute w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -bottom-32 -right-32"></div>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={transition.fade}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 mb-4 shadow-xl shadow-indigo-600/10">
            <Server className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">NodePilot HSCC</h1>
          <p className="text-sm text-slate-400 mt-1">Bảng điều khiển máy chủ cá nhân</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
          {/* Auth Mode Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password')
                setErrorMsg(null)
                setSuccessMsg(null)
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                authMode === 'password'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Mật khẩu</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('otp')
                setErrorMsg(null)
                setSuccessMsg(null)
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                authMode === 'otp'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Gmail OTP</span>
            </button>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.pop}
              className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center space-x-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring.pop}
              className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </motion.div>
          )}

          {/* Mode 1: Username & Password */}
          {authMode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tài khoản
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="stephen3103"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                transition={spring.press}
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/25 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập hệ thống</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>
          )}

          {/* Mode 2: Gmail OTP */}
          {authMode === 'otp' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Địa chỉ Gmail xác thực
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    disabled={isOtpSent}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tranducanh31032006@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 disabled:opacity-70 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Chỉ email trong danh sách cài đặt (Allowlist) được phép truy cập.
                </p>
              </div>

              {!isOtpSent ? (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring.press}
                  type="button"
                  onClick={() => handleSendOTP()}
                  disabled={isLoading || !email.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/25 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi mã...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Gửi mã OTP xác thực</span>
                    </>
                  )}
                </motion.button>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Mã xác thực 6 chữ số
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-center text-lg font-mono tracking-widest text-indigo-400 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <button
                      type="button"
                      disabled={countdown > 0 || isLoading}
                      onClick={() => handleSendOTP()}
                      className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                      {countdown > 0 ? `Gửi lại sau (${countdown}s)` : 'Gửi lại mã'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOtpSent(false)
                        setOtpCode('')
                        setErrorMsg(null)
                        setSuccessMsg(null)
                      }}
                      className="text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      Đổi email
                    </button>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    transition={spring.press}
                    type="submit"
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/25 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Xác nhận & Đăng nhập</span>
                      </>
                    )}
                  </motion.button>
                </form>
              )}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500">
              Bảo mật đa tầng bằng Argon2id & Gmail OTP • Phiên làm việc được mã hóa JWT
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
