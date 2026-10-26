import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  GraduationCap,
  QrCode,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  ArrowRight,
  Settings,
  Edit3,
  SlidersHorizontal,
} from 'lucide-react';
import { teacherApi, attendanceApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TeacherProfileSettingsModal from '../components/TeacherProfileSettingsModal';
import EditCourseSettingsModal from '../components/EditCourseSettingsModal';

const currentYear = new Date().getFullYear();

function getFacultyNameParts(fullName, designation) {
  if (!fullName) {
    return { prefix: 'Prof.', firstName: 'Faculty', surname: 'Member' };
  }

  // If email is passed as fallback
  if (fullName.includes('@')) {
    const username = fullName.split('@')[0];
    const cap = username.charAt(0).toUpperCase() + username.slice(1);
    return { prefix: 'Prof.', firstName: cap, surname: '' };
  }

  let parts = fullName.trim().split(/\s+/);
  let prefix = '';

  const knownPrefixes = ['dr.', 'dr', 'prof.', 'prof', 'mr.', 'mr', 'ms.', 'ms', 'mrs.', 'mrs'];
  if (parts.length > 1 && knownPrefixes.includes(parts[0].toLowerCase())) {
    prefix = parts[0];
    parts = parts.slice(1);
  } else if (designation?.toLowerCase().includes('doctor')) {
    prefix = 'Dr.';
  } else {
    prefix = 'Prof.';
  }

  // Normalize prefix
  if (prefix.toLowerCase().startsWith('dr')) {
    prefix = 'Dr.';
  } else if (prefix.toLowerCase().startsWith('prof')) {
    prefix = 'Prof.';
  } else {
    prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
    if (!prefix.endsWith('.')) prefix += '.';
  }

  const cleanParts = parts.map(
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );

  const firstName = cleanParts.length > 0 ? cleanParts[0] : '';
  const surname = cleanParts.length > 1 ? cleanParts.slice(1).join(' ') : '';

  return { prefix, firstName, surname };
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, logout, isTeacher, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [groupedAssignments, setGroupedAssignments] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [error, setError] = useState('');
  const [activeSessionConflict, setActiveSessionConflict] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditCourseModalOpen, setIsEditCourseModalOpen] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profRes, assignRes, sessRes] = await Promise.all([
        teacherApi.getProfile(),
        teacherApi.getAssignments(),
        attendanceApi.getSessions(),
      ]);

      const profData = profRes.data?.profile || profRes.data;
      setProfile(profData);

      // Support grouped teaching_assignments or flat assignments
      const grouped =
        profRes.data?.teaching_assignments ||
        profRes.data?.profile?.teaching_assignments ||
        [];
      setGroupedAssignments(grouped);

      const list = assignRes.data?.assignments || [];
      setAssignments(list);

      if (list.length > 0) {
        // Keep selected if still valid, otherwise default to first
        setSelectedAssignmentId((prevId) => {
          const exists = list.some((a) => String(a.id) === String(prevId));
          return exists ? prevId : String(list[0].id);
        });
      } else {
        setSelectedAssignmentId('');
      }

      setRecentSessions(sessRes.data?.sessions || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isTeacher) {
      navigate('/teacher/login');
      return;
    }
    loadDashboardData();
  }, [isTeacher, authLoading, navigate, loadDashboardData]);

  const handleStartSession = async () => {
    if (!selectedAssignmentId) {
      setError('Please choose a class, division and subject.');
      return;
    }

    const selected = assignments.find((a) => String(a.id) === String(selectedAssignmentId));
    if (!selected) {
      setError('Selected assignment is not valid.');
      return;
    }

    setStartingSession(true);
    setError('');
    setActiveSessionConflict(null);

    try {
      const res = await attendanceApi.createSession({
        class_id: selected.class_id,
        division_id: selected.division_id,
        subject_id: selected.subject_id,
      });

      const session = res.data?.session;
      if (session?.id) {
        navigate(`/teacher/session/${session.id}`);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        const activeId = err.response.data?.active_session_id;
        setActiveSessionConflict(activeId);
        setError('You already have an active attendance session in progress.');
      } else {
        setError(err.response?.data?.error || 'Failed to start attendance session.');
      }
    } finally {
      setStartingSession(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/teacher/login');
  };

  const selectedAssignment = assignments.find(
    (a) => String(a.id) === String(selectedAssignmentId)
  );

  const nameParts = getFacultyNameParts(
    profile?.full_name || profile?.profile?.full_name || user?.email,
    profile?.designation
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      {/* ── Top Maroon Header Banner ──────────────────────────── */}
      <header className="bg-[#801428] text-white pt-6 pb-8 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-6">
          {/* Top Row: Graduation Cap Icon & Right Controls */}
          <div className="flex items-center justify-between">
            <div className="text-white/90">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadDashboardData}
                title="Refresh Dashboard"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-white border border-white/30 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Teacher Name & Subtitle Row */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl font-normal tracking-tight flex flex-wrap items-baseline gap-x-2.5">
              <span className="font-light text-white/90">{nameParts.prefix}</span>
              <span className="font-bold text-white">{nameParts.firstName}</span>
              {nameParts.surname && (
                <span className="font-light text-white/80 uppercase tracking-wide">
                  {nameParts.surname}
                </span>
              )}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
              <span className="font-medium text-white/95">
                {profile?.department || 'Artificial Intelligence & Data Science'}
              </span>
              <span className="text-white/40">•</span>
              <span className="font-mono text-white/80">
                {profile?.erp_id || profile?.staff_id || '#FAC-205'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditCourseModalOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 active:scale-95 border border-white/30 hover:border-white/50 rounded-full shadow-xs backdrop-blur-md transition-all cursor-pointer group ml-1"
                title="Edit department, designation, and teaching courses"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#E6C687] group-hover:rotate-90 transition-transform duration-300" />
                <span>Edit Course & Department</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 flex-1 w-full space-y-6">
        {/* Conflict / Active Session Alert */}
        {activeSessionConflict && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="text-xs text-amber-900">
                <p className="font-bold">Active Attendance Session Detected</p>
                <p>You have an attendance QR code that is currently live and active.</p>
              </div>
            </div>
            <Link
              to={`/teacher/session/${activeSessionConflict}`}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Resume Session <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Error message */}
        {error && !activeSessionConflict && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-fade-in shadow-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Start Attendance Session Section ────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#801428]" />
                Start New Attendance Session
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Select your assigned course and division to launch the dynamic 90-second QR code.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-600 font-medium bg-gray-50/80 px-3 py-1.5 rounded-full border border-gray-200 self-start sm:self-auto">
              <Clock className="w-3.5 h-3.5 text-[#D4A347]" />
              <span>Duration: 90 Seconds • Token: 5s Rotation</span>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="py-12 text-center max-w-md mx-auto space-y-3">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                <BookOpen className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-gray-900">No Course Assignments Found</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                You haven't mapped any teaching courses to your profile yet. Use the course editor
                to select your subjects and divisions.
              </p>
              <button
                type="button"
                onClick={() => setIsEditCourseModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#801428] text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-[#6c1122] transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Configure Teaching Courses
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Assignment Selector Cards */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                  Choose Assigned Course & Division
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {assignments.map((a) => {
                    const isSelected = String(a.id) === String(selectedAssignmentId);
                    return (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAssignmentId(String(a.id))}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#801428] bg-[#FDF7F8] shadow-xs ring-1 ring-[#801428]'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4A347]">
                              {a.class_name} • Div {a.division_name}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-[#801428]" />
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-gray-900 leading-snug">
                            {a.subject_name}
                          </h4>
                          <span className="text-xs text-gray-500 font-mono mt-1 block">
                            {a.subject_code}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Start Session CTA Row */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-gray-600">
                  {selectedAssignment ? (
                    <span>
                      Selected:{' '}
                      <strong className="text-gray-900 font-semibold">
                        {selectedAssignment.class_name} (Div {selectedAssignment.division_name}) —{' '}
                        {selectedAssignment.subject_name}
                      </strong>
                    </span>
                  ) : (
                    <span>Please pick a course above</span>
                  )}
                </div>

                <button
                  onClick={handleStartSession}
                  disabled={startingSession || !selectedAssignmentId}
                  className="w-full sm:w-auto px-6 py-3 bg-[#801428] hover:bg-[#6c1122] active:scale-[0.99] text-white rounded-xl font-semibold text-xs tracking-wide shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4 text-white/90" />
                  <span>
                    {startingSession ? 'Generating Session...' : 'Start 90-Second Attendance Session'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent Sessions History ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#801428]" />
                Recent Attendance Sessions
              </h3>
              <p className="text-xs text-gray-500">
                Record of sessions initiated by your faculty account
              </p>
            </div>
            <span className="text-xs text-gray-400">
              Showing {recentSessions.length} session(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3">Date & Time</th>
                  <th className="px-5 py-3">Class & Division</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                      No previous sessions recorded. Start your first session above!
                    </td>
                  </tr>
                ) : (
                  recentSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-800 font-medium">
                        {s.starts_at ? new Date(s.starts_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-900">
                        {s.class_name} • Div {s.division_name}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{s.subject_name}</td>
                      <td className="px-5 py-3.5">
                        {s.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            Live (Active)
                          </span>
                        ) : s.status === 'CLOSED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                            Closed Manually
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                            Expired (90s Completed)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {s.status === 'ACTIVE' ? (
                          <Link
                            to={`/teacher/session/${s.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-[#9E2A3B] text-white rounded-lg text-xs font-semibold shadow-xs hover:bg-[#8E1E2D]"
                          >
                            Open Session <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-[11px]">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-400">
        Faculty Attendance Console &copy; {currentYear} &bull; Dr. D. Y. Patil Institute of
        Technology
      </footer>

      {/* Profile & Course Settings Modal */}
      <TeacherProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        initialProfile={profile}
        initialGroupedAssignments={groupedAssignments}
        onSaveSuccess={() => {
          loadDashboardData();
        }}
      />

      {/* Edit Course Settings Modal */}
      <EditCourseSettingsModal
        isOpen={isEditCourseModalOpen}
        onClose={() => setIsEditCourseModalOpen(false)}
        initialProfile={profile}
        assignments={assignments}
        groupedAssignments={groupedAssignments}
        onSaveSuccess={() => {
          loadDashboardData();
        }}
      />
    </div>
  );
}
