import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Mail,
  KeyRound,
  User,
  Hash,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  Clock,
  Building,
  Briefcase,
} from 'lucide-react';
import { authApi } from '../services/api';
import axios from 'axios';
import AssignmentBuilder from '../components/AssignmentBuilder';
import { DEPARTMENTS, DESIGNATIONS } from '../constants/catalogue';

const currentYear = new Date().getFullYear();

export default function TeacherRegister() {
  // Wizard steps: 1 = Email Check & Request OTP, 2 = Verify OTP, 3 = Profile Form, 4 = Success & Code
  const [step, setStep] = useState(1);

  // Form states
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [profile, setProfile] = useState({
    fullName: '',
    department: 'Artificial Intelligence & Data Science',
    designation: 'Assistant Professor',
    erpId: '',
    staffId: '',
  });

  // Dynamic Course Assignments
  const [assignments, setAssignments] = useState([
    {
      academicYear: 'TE — 3rd Year',
      year: 'TE — 3rd Year',
      subject: 'Database Management Systems (DBMS)',
      divisions: ['A', 'B'],
    },
  ]);

  // Result state
  const [generatedLoginCode, setGeneratedLoginCode] = useState('');
  const [copied, setCopied] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Timer for OTP resend
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ── Step 1: Check Email & Send OTP ────────────────────────
  const handleCheckEmailAndSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setLoading(true);
    try {
      // Check if email is in approved allowlist
      await authApi.checkEmail({ email: trimmedEmail });

      // If approved, trigger OTP
      await authApi.sendOTP({
        email: trimmedEmail,
        purpose: 'TEACHER_REGISTRATION',
      });

      setStep(2);
      setResendCooldown(60);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        'This email is not authorized for registration or has already been used.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──────────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await authApi.sendOTP({
        email: email.trim().toLowerCase(),
        purpose: 'TEACHER_REGISTRATION',
      });
      setResendCooldown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Please enter the 6-digit OTP sent to your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.verifyOTP({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        purpose: 'TEACHER_REGISTRATION',
      });

      const token = res.data?.verification_token;
      if (!token) throw new Error('Verification token missing');

      setVerificationToken(token);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Register Teacher Profile ────────────────────
  const handleRegisterProfile = async (e) => {
    e.preventDefault();
    setError('');

    const erpIdValue = (profile.erpId || profile.staffId || '').trim();

    if (
      !profile.fullName.trim() ||
      !profile.department.trim() ||
      !profile.designation.trim() ||
      !erpIdValue
    ) {
      setError('All personal information fields including ERP ID and Department are required.');
      return;
    }

    // Validate course assignments
    if (!assignments || assignments.length === 0) {
      setError('Please add at least one teaching course assignment.');
      return;
    }

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (!a.subject || !a.subject.trim()) {
        setError(`Please select a subject for course assignment #${i + 1}.`);
        return;
      }
      if (!a.divisions || a.divisions.length === 0) {
        setError(`Please select at least one division (A, B, or C) for ${a.subject}.`);
        return;
      }
    }

    setLoading(true);
    try {
      const response = await axios.post(
        '/api/auth/register/teacher',
        {
          full_name: profile.fullName.trim(),
          department: profile.department.trim(),
          designation: profile.designation.trim(),
          erp_id: erpIdValue,
          staff_id: erpIdValue,
          teaching_assignments: assignments,
        },
        {
          headers: {
            Authorization: `Bearer ${verificationToken}`,
          },
        }
      );

      const code = response.data?.login_code;
      setGeneratedLoginCode(code);
      setStep(4);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Registration failed. Please contact the administrator.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Copy code handler
  const handleCopyCode = () => {
    if (!generatedLoginCode) return;
    navigator.clipboard.writeText(generatedLoginCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#9E2A3B] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#9E2A3B]/10 text-[#9E2A3B]">
              DYP DPU Attendance Portal
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className={`w-full ${step === 3 ? 'max-w-2xl' : 'max-w-lg'} transition-all`}>
          {/* Progress Tracker (Steps 1-3) */}
          {step < 4 && (
            <div className="mb-8">
              <div className="flex items-center justify-between relative max-w-md mx-auto">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 w-full bg-gray-200 z-0" />
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-[#9E2A3B] z-0 transition-all duration-300"
                  style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
                />

                {[
                  { num: 1, label: 'Email' },
                  { num: 2, label: 'OTP' },
                  { num: 3, label: 'Profile' },
                ].map((s) => {
                  const isCompleted = step > s.num;
                  const isActive = step === s.num;

                  return (
                    <div key={s.num} className="relative z-10 flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                          isCompleted
                            ? 'bg-[#9E2A3B] text-white'
                            : isActive
                            ? 'bg-[#9E2A3B] text-white ring-4 ring-[#9E2A3B]/20'
                            : 'bg-white text-gray-400 border border-gray-300'
                        }`}
                      >
                        {isCompleted ? <Check className="w-4 h-4 text-white stroke-[3]" /> : s.num}
                      </div>
                      <span
                        className={`text-[11px] font-semibold mt-1.5 ${
                          isActive || isCompleted ? 'text-[#9E2A3B]' : 'text-gray-400'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10 animate-fade-in">
            {/* Error Message */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* ── STEP 1: Verify Allowlisted Email ─────────── */}
            {step === 1 && (
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-[#9E2A3B]/10 text-[#9E2A3B] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-7 h-7" />
                  </div>
                  <h1 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                    Faculty Registration
                  </h1>
                  <p className="text-sm text-gray-600 mt-1.5">
                    Enter the authorized email address provided by your institution.
                  </p>
                </div>

                <form onSubmit={handleCheckEmailAndSendOTP} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                      Institutional Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <Mail className="w-5 h-5" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="faculty@dypvp.edu.in"
                        className="w-full pl-11 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      Note: Your email must be pre-approved by the administrator.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] active:scale-[0.99] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Validating Email...
                      </>
                    ) : (
                      <>
                        Continue to OTP Verification
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* ── STEP 2: OTP Verification ─────────────────── */}
            {step === 2 && (
              <div>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
                    <KeyRound className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                    Verify Email Address
                  </h2>
                  <p className="text-sm text-gray-600 mt-1.5">
                    We sent a 6-digit one-time code to:
                    <span className="block font-semibold text-gray-800 mt-0.5">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOTP} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 text-center">
                      Enter 6-Digit Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Didn't receive the code?</span>
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendCooldown > 0 || loading}
                      className="font-semibold text-[#9E2A3B] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3 px-4 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                    >
                      Change Email
                    </button>
                    <button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="flex-1 py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify & Proceed
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── STEP 3: Teacher Profile Details & Course Mapping ─ */}
            {step === 3 && (
              <div>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-[#9E2A3B]/10 text-[#9E2A3B] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <GraduationCap className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                    Faculty Profile & Courses
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Provide your institutional profile details and map your current teaching
                    assignments.
                  </p>
                </div>

                <form onSubmit={handleRegisterProfile} className="space-y-5">
                  {/* Personal Information Group */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Personal Information
                    </h3>

                    {/* Full Name */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        Full Legal Name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={profile.fullName}
                          onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                          placeholder="e.g., Dr. Rajesh Sharma"
                          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                        />
                      </div>
                    </div>

                    {/* ERP ID */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                        ERP ID <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <Hash className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={profile.erpId || profile.staffId}
                          onChange={(e) => setProfile({ ...profile, erpId: e.target.value, staffId: e.target.value })}
                          placeholder="e.g., ERP-10492"
                          className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Official institutional ERP identifier assigned by administration.
                      </p>
                    </div>

                    {/* Department & Designation dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-gray-400" />
                          Department <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={profile.department}
                          onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                        >
                          {DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                          Designation <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={profile.designation}
                          onChange={(e) => setProfile({ ...profile, designation: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                        >
                          {DESIGNATIONS.map((desig) => (
                            <option key={desig} value={desig}>
                              {desig}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Teaching Courses & Subject Mapping (Dynamic Builder) */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <AssignmentBuilder
                      assignments={assignments}
                      onChange={setAssignments}
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 mt-4 bg-[#9E2A3B] hover:bg-[#8E1E2D] active:scale-[0.99] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting Registration...
                      </>
                    ) : (
                      'Complete Faculty Registration'
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* ── STEP 4: Success & Display Login Code ─────── */}
            {step === 4 && (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-[#9E2A3B]">Registration Submitted!</h2>
                  <p className="text-sm text-gray-600 mt-1.5">
                    Your faculty account has been created. An administrator will review and approve
                    your access shortly.
                  </p>
                </div>

                {/* Login Code Presentation */}
                <div className="bg-[#F8F9FA] border-2 border-dashed border-[#D4A347] rounded-2xl p-6 text-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#9E731C] block mb-2">
                    Your Permanent Login Code
                  </span>

                  <div className="font-mono text-2xl font-bold text-[#9E2A3B] tracking-wider select-all bg-white py-3 px-4 rounded-xl border border-gray-200 shadow-xs">
                    {generatedLoginCode}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="mt-3.5 px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-[#9E2A3B]" />
                        Copy Login Code
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-gray-500 mt-3">
                    Please save this code in a secure location. It has also been dispatched to{' '}
                    <span className="font-semibold text-gray-800">{email}</span>.
                  </p>
                </div>

                {/* Status Notice */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold mb-0.5">Status: Pending Administrator Approval</p>
                    <p>
                      You will be able to log in with your email and code once the administrator
                      approves your submitted faculty profile.
                    </p>
                  </div>
                </div>

                <Link
                  to="/teacher/login"
                  className="block w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl font-semibold text-sm shadow-sm transition-all cursor-pointer"
                >
                  Go to Teacher Login
                </Link>
              </div>
            )}

            {/* Bottom link back */}
            {step < 4 && (
              <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-500">
                  Already have your approved login code?{' '}
                  <Link to="/teacher/login" className="font-semibold text-[#9E2A3B] hover:underline">
                    Sign In
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400">
        Faculty Registration Portal &copy; {currentYear} &bull; Dr. D. Y. Patil Institute of
        Technology
      </footer>
    </div>
  );
}
