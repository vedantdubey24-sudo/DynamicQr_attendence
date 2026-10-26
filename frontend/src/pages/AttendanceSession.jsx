import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Clock, AlertCircle, ArrowLeft, RefreshCw, Shield, XCircle
} from 'lucide-react';
import { attendanceApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const currentYear = new Date().getFullYear();

export default function AttendanceSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { isTeacher } = useAuth();

  const [session, setSession] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  // Overall session countdown (seconds remaining out of 90)
  const [sessionRemaining, setSessionRemaining] = useState(90);

  // 5-second rotation countdown (seconds remaining in current token)
  const [tokenRemaining, setTokenRemaining] = useState(5);

  // Rotation count tracking
  const [rotationCount, setRotationCount] = useState(1);
  const TOTAL_ROTATIONS = 18; // 90s / 5s

  const isSessionOver = session?.status === 'EXPIRED' || session?.status === 'CLOSED';

  // ── Initial Fetch & Setup ─────────────────────────────────
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessRes, qrRes] = await Promise.all([
        attendanceApi.getSession(sessionId),
        attendanceApi.getCurrentQR(sessionId),
      ]);

      const currentSession = sessRes.data?.session;
      setSession(currentSession);

      const qr = qrRes.data?.qr;
      setQrData(qr);

      if (qr?.remaining_seconds !== undefined) {
        setSessionRemaining(qr.remaining_seconds);
        const elapsed = 90 - qr.remaining_seconds;
        setRotationCount(Math.min(TOTAL_ROTATIONS, Math.floor(elapsed / 5) + 1));
      }
    } catch (err) {
      if (err.response?.status === 410) {
        setSession(err.response.data?.session || { status: 'EXPIRED' });
      } else {
        setError(err.response?.data?.error || 'Failed to load attendance session');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!isTeacher) {
      navigate('/teacher/login');
      return;
    }

    fetchInitialData();
  }, [isTeacher, navigate, fetchInitialData]);

  // ── Fetch Next Rotated QR Token ───────────────────────────
  const fetchRotatedQR = useCallback(async () => {
    if (isSessionOver) return;

    try {
      const res = await attendanceApi.getCurrentQR(sessionId);
      const newQr = res.data?.qr;
      if (newQr) {
        setQrData(newQr);
        if (newQr.remaining_seconds !== undefined) {
          setSessionRemaining(newQr.remaining_seconds);
        }
        setTokenRemaining(5);
        setRotationCount((prev) => Math.min(TOTAL_ROTATIONS, prev + 1));
      }
    } catch (err) {
      if (err.response?.status === 410) {
        setSession((prev) => ({ ...prev, status: 'EXPIRED' }));
        setSessionRemaining(0);
      }
    }
  }, [isSessionOver, sessionId]);

  // ── 1-Second Master Tick Loop ─────────────────────────────
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;

    const interval = setInterval(() => {
      // Tick overall session
      setSessionRemaining((prev) => {
        if (prev <= 1) {
          setSession((s) => ({ ...s, status: 'EXPIRED' }));
          return 0;
        }
        return prev - 1;
      });

      // Tick token rotation countdown
      setTokenRemaining((prev) => {
        if (prev <= 1) {
          // Trigger rotation
          fetchRotatedQR();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status, sessionId]);

  // ── Close Session Early ───────────────────────────────────
  const handleCloseSession = async () => {
    if (!window.confirm('Are you sure you want to conclude this attendance session early?')) {
      return;
    }

    setClosing(true);
    try {
      const res = await attendanceApi.closeSession(sessionId);
      setSession(res.data?.session || { status: 'CLOSED' });
      setSessionRemaining(0);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to close session');
    } finally {
      setClosing(false);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const sessionProgressPercent = Math.max(0, Math.min(100, (sessionRemaining / 90) * 100));
  const tokenProgressPercent = Math.max(0, Math.min(100, (tokenRemaining / 5) * 100));

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-white border-b border-[#E5E7EB] py-3.5 px-6 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/teacher/dashboard"
            className="flex items-center gap-2 text-sm font-medium text-[#6B7280] hover:text-[#9E2A3B] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-center gap-3">
            {session?.status === 'ACTIVE' ? (
              <span className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live Dynamic Session
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                Session {session?.status}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Session Workspace */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full flex flex-col items-center justify-center">
        {error && (
          <div className="w-full mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-[#9E2A3B] mx-auto" />
            <p className="text-sm font-semibold text-[#6B7280]">
              Initializing Dynamic Attendance Session...
            </p>
          </div>
        ) : isSessionOver ? (
          /* ── Session Ended State ─────────────────────────────── */
          <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-[#E5E7EB] p-8 sm:p-10 text-center animate-fade-in space-y-6">
            <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-[#1F2937]">
                Attendance Session Finished
              </h2>
              <p className="text-xs text-[#6B7280] mt-1">
                The 90-second attendance window has expired. Dynamic QR tokens are now deactivated.
              </p>
            </div>

            <div className="bg-[#F9FAFB] rounded-2xl p-4 border border-[#E5E7EB] text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Class:</span>
                <span className="font-semibold text-[#1F2937]">{session?.class_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Division:</span>
                <span className="font-semibold text-[#1F2937]">Div {session?.division_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Subject:</span>
                <span className="font-semibold text-[#1F2937]">{session?.subject_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Result Status:</span>
                <span className="font-bold text-[#9E2A3B]">{session?.status}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/teacher/dashboard')}
              className="w-full py-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl font-bold text-sm shadow-sm transition-all cursor-pointer"
            >
              Return to Faculty Dashboard
            </button>
          </div>
        ) : (
          /* ── Active 90s QR Session ──────────────────────────── */
          <div className="w-full bg-white rounded-3xl shadow-sm border border-[#E5E7EB] overflow-hidden animate-fade-in">
            {/* Header / Session Details */}
            <div className="bg-gradient-to-r from-[#9E2A3B] to-[#8E1E2D] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#E8C97A]">
                  Active Lecture Attendance
                </span>
                <h2 className="text-xl sm:text-2xl font-bold mt-0.5">
                  {session?.class_name} — Div {session?.division_name}
                </h2>
                <p className="text-sm text-white/80 font-medium">
                  {session?.subject_name}
                </p>
              </div>

              {/* Master 90s Countdown Badge */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-center sm:text-right min-w-[140px]">
                <span className="text-[10px] uppercase font-bold text-white/70 block">
                  Session Ends In
                </span>
                <span
                  className={`text-3xl font-mono font-bold tracking-tight ${
                    sessionRemaining <= 15 ? 'text-red-300 animate-pulse' : 'text-white'
                  }`}
                >
                  {formatTime(sessionRemaining)}
                </span>
                <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[#E8C97A] transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${sessionProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Main Interactive Stage */}
            <div className="p-6 sm:p-10 flex flex-col items-center text-center">
              {/* Token Rotation Indicator */}
              <div className="w-full max-w-sm mb-6 flex items-center justify-between bg-[#F8F9FA] px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#9E2A3B] animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="font-semibold text-[#1F2937]">
                    Token {rotationCount} of {TOTAL_ROTATIONS}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[#D4A347] font-bold">
                  <span>Rotating in:</span>
                  <span className="text-sm text-[#9E2A3B] w-4 text-right">
                    {tokenRemaining}s
                  </span>
                </div>
              </div>

              {/* QR Code Frame */}
              <div className="relative p-6 bg-white rounded-3xl border-4 border-[#9E2A3B]/20 shadow-md group">
                {/* Visual Corner Markers */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-[#9E2A3B]" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-[#9E2A3B]" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-[#9E2A3B]" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-[#9E2A3B]" />

                {qrData?.token ? (
                  <QRCodeSVG
                    value={qrData.token}
                    size={280}
                    level="H"
                    includeMargin={true}
                    className="mx-auto rounded-lg"
                  />
                ) : (
                  <div className="w-[280px] h-[280px] flex items-center justify-center text-xs text-[#9CA3AF]">
                    Generating QR Token...
                  </div>
                )}

                {/* 5s Rotation Progress Line */}
                <div className="w-full bg-[#E5E7EB] h-1.5 rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-[#9E2A3B] transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${tokenProgressPercent}%` }}
                  />
                </div>
              </div>

              {/* Security Banner */}
              <div className="mt-8 flex items-center gap-2 text-xs text-[#6B7280] bg-[#F9FAFB] px-4 py-2 rounded-full border border-[#E5E7EB]">
                <Shield className="w-4 h-4 text-[#059669]" />
                <span>
                  Dynamic 5-second rotation active • Screen capture prevention enabled
                </span>
              </div>

              {/* Close Session Button */}
              <div className="mt-8 pt-6 border-t border-[#E5E7EB] w-full max-w-md flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCloseSession}
                  disabled={closing}
                  className="w-full py-3 bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {closing ? 'Closing Session...' : 'Close Session Immediately'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#9CA3AF]">
        Active Attendance Session Engine &copy; {currentYear}
      </footer>
    </div>
  );
}
