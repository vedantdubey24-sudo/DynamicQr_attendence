import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, Mail, Eye, EyeOff, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { adminApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const currentYear = new Date().getFullYear();

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await adminApi.login({
        email: email.trim().toLowerCase(),
        password,
      });

      const { access_token, user } = response.data;
      login(access_token, user);
      navigate('/admin/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid admin credentials. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E5E7EB] py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-[#6B7280] hover:text-[#9E2A3B] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#9E2A3B]/10 text-[#9E2A3B]">
            Admin Portal
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 sm:p-10 animate-fade-in">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-[#9E2A3B]/10 text-[#9E2A3B] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold text-[#9E2A3B] tracking-tight">
                Admin Sign In
              </h1>
              <p className="text-sm text-[#6B7280] mt-1.5">
                Manage faculty allowlist, approvals & academic allocations
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#4B5563] mb-1.5">
                  Admin Email Address
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
                    placeholder="admin@institute.edu"
                    className="w-full pl-11 pr-4 py-2.5 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/30 focus:border-[#9E2A3B] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#4B5563] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9CA3AF]">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-11 py-2.5 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/30 focus:border-[#9E2A3B] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#9CA3AF] hover:text-[#4B5563]"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] active:scale-[0.99] text-white rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign In to Dashboard'
                )}
              </button>
            </form>

            {/* Note */}
            <div className="mt-8 pt-6 border-t border-[#E5E7EB] text-center">
              <p className="text-xs text-[#6B7280]">
                Are you a faculty member?{' '}
                <Link to="/teacher/login" className="font-semibold text-[#9E2A3B] hover:underline">
                  Go to Teacher Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#9CA3AF]">
        Protected Institutional Attendance Portal &copy; {currentYear}
      </footer>
    </div>
  );
}
