import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  KeyRound, Mail, ArrowLeft, ArrowRight, CheckCircle2,
  AlertCircle, Copy, Check, Loader2, ShieldAlert
} from 'lucide-react';
import { authApi } from '../services/api';

const currentYear = new Date().getFullYear();

export default function ForgotLoginCode() {
  // Steps: 1 = Email, 2 = Verify OTP, 3 = New Code Displayed
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newLoginCode, setNewLoginCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ── Step 1: Request Recovery OTP ─────────────────────────
  const handleSendRecoveryOTP = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please provide a valid registered email address.');
      return;
    }

    setLoading(true);
    try {
      await authApi.recoverySendOTP({ email: trimmed });
      setStep(2);
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send recovery OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await authApi.recoverySendOTP({ email: email.trim().toLowerCase() });
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend recovery OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify Recovery OTP & Reset ──────────────────
  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify OTP
      const verifyRes = await authApi.recoveryVerifyOTP({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      const token = verifyRes.data?.recovery_token;
      if (!token) throw new Error('Recovery token missing');

      // 2. Request new login code
      const resetRes = await authApi.resetLoginCode({
        email: email.trim().toLowerCase(),
        recovery_token: token,
      });

      const code = resetRes.data?.login_code;
      setNewLoginCode(code);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!newLoginCode) return;
    navigator.clipboard.writeText(newLoginCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/teacher/login"
            className="flex items-center gap-2 text-sm font-medium text-[#6B7280] hover:text-[#9E2A3B] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Teacher Login
          </Link>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#9E2A3B]/10 text-[#9E2A3B]">
            Code Recovery
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 sm:p-10 animate-fade-in">
            {/* Error Message */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Step 1: Enter Email */}
            {step === 1 && (
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-7 h-7" />
                  </div>
                  <h1 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                    Recover Login Code
                  </h1>
                  <p className="text-sm text-[#6B7280] mt-1.5">
                    Enter your registered email to receive a secure passwordless recovery OTP.
                  </p>
                </div>

                <form onSubmit={handleSendRecoveryOTP} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#4B5563] mb-1.5">
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                        <Mail className="w-5 h-5" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="prof.name@institute.edu"
                        className="w-full pl-11 pr-4 py-2.5 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/30 focus:border-[#9E2A3B]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] active:scale-[0.99] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        Send Recovery OTP
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {step === 2 && (
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                    Verify Identity
                  </h2>
                  <p className="text-sm text-[#6B7280] mt-1.5">
                    Enter the 6-digit recovery code sent to:
                    <span className="block font-semibold text-[#1F2937] mt-0.5">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyAndReset} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#4B5563] mb-1.5 text-center">
                      6-Digit Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#1F2937] placeholder-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/30 focus:border-[#9E2A3B]"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#6B7280]">
                    <span>Didn't get code?</span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || loading}
                      className="font-semibold text-[#9E2A3B] hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3 px-4 bg-white border border-[#E5E7EB] text-[#6B7280] rounded-xl text-sm font-semibold hover:bg-[#F9FAFB] cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="flex-1 py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Reset Login Code'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Step 3: Success & New Code */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-[#9E2A3B]">
                    New Login Code Generated
                  </h2>
                  <p className="text-sm text-[#6B7280] mt-1.5">
                    Your previous login code has been revoked and replaced.
                  </p>
                </div>

                <div className="bg-[#F8F9FA] border-2 border-dashed border-[#D4A347] rounded-2xl p-6 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#9E731C] block mb-2">
                    Your New Login Code
                  </span>

                  <div className="font-mono text-2xl font-bold text-[#9E2A3B] tracking-wider select-all bg-white py-3 px-4 rounded-xl border border-[#E5E7EB] shadow-xs">
                    {newLoginCode}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="mt-3.5 px-4 py-2 bg-white hover:bg-[#F3F4F6] border border-[#E5E7EB] text-[#4B5563] text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#9E2A3B]" />
                        Copy New Code
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-[#6B7280] mt-3">
                    A copy has also been sent to your email address.
                  </p>
                </div>

                <Link
                  to="/teacher/login"
                  className="block w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl font-semibold text-sm shadow-sm transition-all cursor-pointer"
                >
                  Proceed to Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#9CA3AF]">
        Institutional Credential Management &copy; {currentYear}
      </footer>
    </div>
  );
}
