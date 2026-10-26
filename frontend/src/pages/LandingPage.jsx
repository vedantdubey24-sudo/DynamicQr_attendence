import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Landmark,
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  UserCheck,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';

const currentYear = new Date().getFullYear();

export default function LandingPage() {
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsStudentModalOpen(false);
      }
    };
    if (isStudentModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStudentModalOpen]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-between font-sans">
      {/* ── Institutional Header Bar (Red Background #9E2A3B) ── */}
      <header className="bg-[#9E2A3B] text-white py-10 md:py-12 px-6 shadow-md border-b-4 border-[#D4A347]">
        <div className="max-w-7xl mx-auto text-center space-y-2.5">
          <p className="text-xs md:text-sm font-bold tracking-[0.2em] text-white/90 uppercase">
            DR. D. Y. PATIL UNITECH SOCIETY'S
          </p>
          <div className="inline-block relative">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-widest text-white uppercase">
              DYP DPU
            </h1>
            <div className="h-1.5 bg-[#D4A347] w-48 md:w-64 rounded-full mt-2 mx-auto"></div>
          </div>
          <h2 className="text-lg md:text-2xl lg:text-3xl font-extrabold text-white max-w-4xl mx-auto pt-2">
            Dr. D. Y. Patil Institute of Technology, Pimpri, Pune
          </h2>

          <div className="pt-2">
            <span className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-white/15 text-[#E8C97A] border border-white/20 font-bold text-xs uppercase tracking-widest shadow-xs">
              Institutional Attendance Management
            </span>
          </div>
        </div>
      </header>

      {/* ── Section Portal Cards ── */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14 w-full">

        {/* ── Enlarged Section Portals ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
          {/* 1. Admin Portal */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-2xl border border-gray-200 hover:border-gray-300 transition-all duration-300 flex flex-col justify-between overflow-hidden group min-h-[460px] md:min-h-[500px]">
            <div className="h-3 bg-[#9E2A3B] w-full"></div>
            <div className="p-8 lg:p-10 flex-1 flex flex-col justify-between">
              <div>
                <div className="w-18 h-18 bg-[#9E2A3B]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#9E2A3B]/15 transition-colors">
                  <Landmark className="w-9 h-9 text-[#9E2A3B]" />
                </div>
                <h4 className="text-2xl font-black text-gray-900 mb-3">Admin Portal</h4>
                <p className="text-base text-gray-600 leading-relaxed mb-8">
                  Manage email allowlists, approve faculty accounts, configure classes and subjects,
                  and view institutional security audit logs.
                </p>
              </div>
              <Link
                to="/admin/login"
                className="w-full py-4 px-6 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white font-bold text-base rounded-xl text-center flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all"
              >
                <span>Admin Login</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* 2. Faculty Portal */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-2xl border border-gray-200 hover:border-gray-300 transition-all duration-300 flex flex-col justify-between overflow-hidden group min-h-[460px] md:min-h-[500px]">
            <div className="h-3 bg-[#D4A347] w-full"></div>
            <div className="p-8 lg:p-10 flex-1 flex flex-col justify-between">
              <div>
                <div className="w-18 h-18 bg-[#D4A347]/15 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#D4A347]/25 transition-colors">
                  <ShieldCheck className="w-9 h-9 text-[#9E2A3B]" />
                </div>
                <h4 className="text-2xl font-black text-gray-900 mb-3">Faculty Portal</h4>
                <p className="text-base text-gray-600 leading-relaxed mb-8">
                  Access your self-managed teaching assignments, start dynamic 90-second QR
                  attendance sessions, and track class participation.
                </p>
              </div>
              <div className="space-y-3">
                <Link
                  to="/teacher/login"
                  className="w-full py-4 px-6 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white font-bold text-base rounded-xl text-center flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all"
                >
                  <UserCheck className="w-5 h-5" />
                  <span>Faculty Login</span>
                </Link>
                <div className="flex items-center justify-between text-sm pt-2 px-1">
                  <Link
                    to="/teacher/register"
                    className="text-[#9E2A3B] hover:text-[#8E1E2D] font-bold underline underline-offset-2"
                  >
                    New Registration
                  </Link>
                  <Link
                    to="/teacher/forgot-code"
                    className="text-gray-500 hover:text-gray-900 font-semibold underline underline-offset-2"
                  >
                    Forgot Code?
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Student Portal */}
          <div className="bg-white rounded-2xl shadow-md hover:shadow-2xl border border-gray-200 hover:border-gray-300 transition-all duration-300 flex flex-col justify-between overflow-hidden group min-h-[460px] md:min-h-[500px]">
            <div className="h-3 bg-gray-400 w-full"></div>
            <div className="p-8 lg:p-10 flex-1 flex flex-col justify-between">
              <div>
                <div className="w-18 h-18 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gray-200 transition-colors">
                  <GraduationCap className="w-9 h-9 text-gray-700" />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-2xl font-black text-gray-900">Student Portal</h4>
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                    Phase 2
                  </span>
                </div>
                <p className="text-base text-gray-600 leading-relaxed mb-8">
                  Scan rotating QR codes during lecture sessions to record your attendance instantly
                  and track personal semester attendance analytics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStudentModalOpen(true)}
                className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-base rounded-xl text-center flex items-center justify-center gap-2.5 transition-all border border-gray-300"
              >
                <span>Student Access</span>
                <ArrowRight className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs md:text-sm text-gray-500">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-gray-800">
            Dr. D. Y. Patil Institute of Technology &bull; Smart Attendance Management System
          </p>
          <p>&copy; {currentYear} DYP DPU. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Accessible Work In Progress Modal for Student Portal ── */}
      {isStudentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsStudentModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-gray-100 relative space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsStudentModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-8 h-8" />
            </div>

            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Feature Coming Soon </span>
              </div>
              <h3 id="student-modal-title" className="text-xl font-bold text-gray-900">
                Student Portal Under Development
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                The student mobile scanning interface and personal attendance reporting portal are
                currently undergoing campus security and network testing.
              </p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-800">What to expect in Phase 2:</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                <li>Dynamic QR camera scanner with location verification</li>
                <li>Real-time attendance confirmation</li>
                <li>Monthly subject-wise percentage analytics</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setIsStudentModalOpen(false)}
              className="w-full py-2.5 px-4 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              Got it, Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
