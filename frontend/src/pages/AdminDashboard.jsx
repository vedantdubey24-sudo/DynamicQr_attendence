import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Mail,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  BookOpen,
  AlertCircle,
  RefreshCw,
  LogOut,
  Search,
  UserCheck,
  Check,
  X,
  Layers,
  Loader2,
  Building2,
  Filter,
  Edit3,
  UserX,
  SlidersHorizontal,
  Brain,
  Laptop,
  Globe,
  Radio,
  Cog,
  Building,
  GraduationCap,
  Bot,
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { adminApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { DEPARTMENTS } from '../constants/catalogue';

const DEPARTMENT_ICONS = {
  'Artificial Intelligence & Data Science': Brain,
  'Computer Engineering': Laptop,
  'Information Technology': Globe,
  'Electronics & Telecommunication': Radio,
  'Mechanical Engineering': Cog,
  'Civil Engineering': Building,
  'First Year Department': GraduationCap,
  'Automation and Robotics': Bot,
  'Instrumentation Engineering': Gauge,
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout, isAdmin, loading: authLoading } = useAuth();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('allowlist'); // 'allowlist' | 'pending' | 'teachers'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState({}); // { [id]: 'approving' | 'rejecting' }

  // Data states
  const [approvedEmails, setApprovedEmails] = useState([]);
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [approvedTeachers, setApprovedTeachers] = useState([]);

  // Filter & input states
  const [newEmail, setNewEmail] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);

  // Department-Wise Directory filter & search states
  const [facultySearch, setFacultySearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [reassignModal, setReassignModal] = useState({
    isOpen: false,
    teacher: null,
    targetDept: '',
    loading: false,
  });

  const fetchApprovedEmails = useCallback(async () => {
    try {
      const res = await adminApi.getApprovedEmails();
      setApprovedEmails(res.data?.entries || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchPendingTeachers = useCallback(async () => {
    try {
      const res = await adminApi.getPendingTeachers('PENDING');
      setPendingTeachers(res.data?.teachers || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchApprovedTeachers = useCallback(async () => {
    try {
      const res = await adminApi.getPendingTeachers('APPROVED');
      setApprovedTeachers(res.data?.teachers || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchApprovedEmails(),
        fetchPendingTeachers(),
        fetchApprovedTeachers(),
      ]);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchApprovedEmails, fetchPendingTeachers, fetchApprovedTeachers]);

  const showToast = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate('/admin/login');
      return;
    }
    loadAllData();
  }, [isAdmin, authLoading, navigate, loadAllData]);

  // ── Add single email ────────────────────────────────────
  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    try {
      await adminApi.addApprovedEmail({ email: newEmail.trim().toLowerCase() });
      showToast('success', `Added ${newEmail.trim()} to authorized allowlist.`);
      setNewEmail('');
      fetchApprovedEmails();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to add email');
    }
  };

  // ── Upload CSV ──────────────────────────────────────────
  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      showToast('error', 'Please choose a CSV file first');
      return;
    }

    setCsvUploading(true);
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await adminApi.uploadCSV(formData);
      showToast('success', res.data?.message || 'CSV uploaded successfully');
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchApprovedEmails();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'CSV upload failed');
    } finally {
      setCsvUploading(false);
    }
  };

  // ── Delete approved email ───────────────────────────────
  const handleDeleteEmail = async (id, email, isUsed) => {
    const confirmMsg = isUsed
      ? `Are you sure you want to delete ${email} and its registered faculty account from the system?`
      : `Remove ${email} from authorized allowlist?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await adminApi.deleteApprovedEmail(id);
      showToast('success', `Removed ${email}`);
      await Promise.all([
        fetchApprovedEmails(),
        fetchPendingTeachers(),
        fetchApprovedTeachers(),
      ]);
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to remove email');
    }
  };

  // ── Approve Faculty (Task 4) ────────────────────────────
  const handleApproveFaculty = async (teacher) => {
    const teacherId = teacher.id;
    const name = teacher.profile?.full_name || teacher.email;

    setActionLoading((prev) => ({ ...prev, [teacherId]: 'approving' }));
    try {
      await adminApi.approveFaculty(teacherId);
      showToast('success', `Faculty ${name} has been approved and activated!`);
      // Update data immediately
      await Promise.all([fetchPendingTeachers(), fetchApprovedTeachers()]);
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to approve faculty member');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[teacherId];
        return next;
      });
    }
  };

  // ── Reject Faculty (Task 4) ─────────────────────────────
  const handleRejectFaculty = async (teacher) => {
    const teacherId = teacher.id;
    const name = teacher.profile?.full_name || teacher.email;

    if (!window.confirm(`Are you sure you want to reject the registration for ${name}?`)) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [teacherId]: 'rejecting' }));
    try {
      await adminApi.rejectFaculty(teacherId);
      showToast('success', `Faculty registration for ${name} has been rejected.`);
      await fetchPendingTeachers();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to reject faculty registration');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[teacherId];
        return next;
      });
    }
  };

  const handleOpenReassignModal = (teacher) => {
    setReassignModal({
      isOpen: true,
      teacher,
      targetDept: teacher.profile?.department || DEPARTMENTS[0],
      loading: false,
    });
  };

  const handleSaveReassignDepartment = async () => {
    if (!reassignModal.teacher || !reassignModal.targetDept) return;
    setReassignModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await adminApi.updateFacultyDepartment(reassignModal.teacher.id, {
        department: reassignModal.targetDept,
      });
      showToast('success', res.data?.message || `Department updated to ${reassignModal.targetDept}`);
      setReassignModal({ isOpen: false, teacher: null, targetDept: '', loading: false });
      await fetchApprovedTeachers();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to update faculty department');
      setReassignModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleToggleFacultyStatus = async (teacher) => {
    const isCurrentlyActive = teacher.status === 'APPROVED';
    const newStatus = isCurrentlyActive ? 'SUSPENDED' : 'APPROVED';
    const facultyName = teacher.profile?.full_name || teacher.email;
    const confirmMsg = isCurrentlyActive
      ? `Deactivate ${facultyName}? Their account will be temporarily suspended, but historical attendance records and course mappings will be preserved.`
      : `Reactivate ${facultyName}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await adminApi.updateFacultyStatus(teacher.id, { status: newStatus });
      showToast('success', `Faculty status updated for ${facultyName}.`);
      await fetchApprovedTeachers();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to update faculty status');
    }
  };

  // ── Approved Faculty Department Grouping & Filtering ──────
  const matchesFacultySearch = useCallback((teacher, query) => {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    const name = (teacher.profile?.full_name || '').toLowerCase();
    const email = (teacher.email || '').toLowerCase();
    const erpId = (teacher.profile?.erp_id || teacher.profile?.staff_id || '').toLowerCase();
    return name.includes(q) || email.includes(q) || erpId.includes(q);
  }, []);

  const {
    facultyByDept,
    matchingFacultyByDept,
    unassignedFaculty,
    totalMatchingCount,
    displayedFaculty,
  } = useMemo(() => {
    const byDept = {};
    const matchingByDept = {};
    DEPARTMENTS.forEach((dept) => {
      byDept[dept] = [];
      matchingByDept[dept] = [];
    });
    const unassigned = [];

    approvedTeachers.forEach((t) => {
      const dName = (t.profile?.department || '').trim();
      const matchedOfficial = DEPARTMENTS.find(
        (d) => d.toLowerCase() === dName.toLowerCase()
      );
      const isMatch = matchesFacultySearch(t, facultySearch);

      if (matchedOfficial) {
        byDept[matchedOfficial].push(t);
        if (isMatch) {
          matchingByDept[matchedOfficial].push(t);
        }
      } else {
        unassigned.push(t);
      }
    });

    let displayed = [];
    if (selectedDepartment === 'ALL') {
      displayed = approvedTeachers.filter((t) => matchesFacultySearch(t, facultySearch));
    } else {
      const deptFaculty = byDept[selectedDepartment] || [];
      displayed = deptFaculty.filter((t) => matchesFacultySearch(t, facultySearch));
    }

    const totalMatching = approvedTeachers.filter((t) => matchesFacultySearch(t, facultySearch)).length;

    return {
      facultyByDept: byDept,
      matchingFacultyByDept: matchingByDept,
      unassignedFaculty: unassigned,
      totalMatchingCount: totalMatching,
      displayedFaculty: displayed,
    };
  }, [approvedTeachers, facultySearch, selectedDepartment, matchesFacultySearch]);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const filteredEmails = approvedEmails.filter((e) =>
    e.email.toLowerCase().includes(emailSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#9E2A3B] rounded-xl flex items-center justify-center text-white shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[#9E2A3B] leading-none">
                  Admin Console
                </h1>
                <span className="text-[11px] font-semibold uppercase bg-[#D4A347]/15 text-[#9E2A3B] px-2 py-0.5 rounded-full">
                  DYP DPU
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadAllData}
              title="Refresh Data"
              className="p-2 text-gray-500 hover:text-[#9E2A3B] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <div className="h-5 w-[1px] bg-gray-200" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Toast Alert */}
      {message.text && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 w-full animate-fade-in">
          <div
            className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-sm ${
              message.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Allowlisted Emails
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {approvedEmails.length}
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                {approvedEmails.filter((e) => !e.is_used).length} Available for Registration
              </p>
            </div>
            <div className="w-12 h-12 bg-[#9E2A3B]/10 text-[#9E2A3B] rounded-xl flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Pending Approvals
              </p>
              <p className="text-2xl font-bold text-[#9E2A3B] mt-1">
                {pendingTeachers.length}
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                Requires admin review
              </p>
            </div>
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Approved Faculty
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {approvedTeachers.length}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Active in system
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-gray-200 gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('allowlist')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'allowlist'
                ? 'border-[#9E2A3B] text-[#9E2A3B] bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Mail className="w-4 h-4" />
            Approved Teacher Emails
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {approvedEmails.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'pending'
                ? 'border-[#9E2A3B] text-[#9E2A3B] bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Pending Approvals
            {pendingTeachers.length > 0 && (
              <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                {pendingTeachers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('teachers')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'teachers'
                ? 'border-[#9E2A3B] text-[#9E2A3B] bg-white shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Approved Faculty Directory
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {approvedTeachers.length}
            </span>
          </button>
        </div>

        {/* ── TAB 1: Approved Emails Allowlist ───────────────── */}
        {activeTab === 'allowlist' && (
          <div className="space-y-6 animate-fade-in">
            {/* Adding Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Single Add */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                  <Plus className="w-4 h-4 text-[#9E2A3B]" />
                  Add Authorized Teacher Email
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Only email addresses listed here will be allowed to register as faculty.
                </p>
                <form onSubmit={handleAddEmail} className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="faculty@dypvp.edu.in"
                    className="flex-1 px-3.5 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Authorize
                  </button>
                </form>
              </div>

              {/* CSV Upload */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                  <Upload className="w-4 h-4 text-[#D4A347]" />
                  Bulk Upload via CSV
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Upload a CSV file containing one email address per line.
                </p>
                <form onSubmit={handleCsvUpload} className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="flex-1 text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#9E2A3B]/10 file:text-[#9E2A3B] hover:file:bg-[#9E2A3B]/20 cursor-pointer"
                  />
                  <button
                    type="submit"
                    disabled={!csvFile || csvUploading}
                    className="px-4 py-2 bg-[#D4A347] hover:bg-[#c3933a] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {csvUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Upload CSV
                  </button>
                </form>
              </div>
            </div>

            {/* Table of Approved Emails */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <h3 className="text-sm font-bold text-gray-900">Authorized Teacher Allowlist</h3>
                  <span className="text-xs text-gray-500">({filteredEmails.length} entries)</span>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    placeholder="Search email..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9E2A3B]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-5 py-3">Teacher Email</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Authorized Date</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredEmails.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                          No approved emails found. Add an email above or upload a CSV.
                        </td>
                      </tr>
                    ) : (
                      filteredEmails.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-gray-900">
                            {item.email}
                          </td>
                          <td className="px-5 py-3.5">
                            {item.is_used ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Registered
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                Available for Registration
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => handleDeleteEmail(item.id, item.email, item.is_used)}
                              title={item.is_used ? "Delete email & registered account" : "Remove from allowlist"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: Pending Registrations ─────────────────────── */}
        {activeTab === 'pending' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
              <div className="mb-4">
                <h2 className="text-base font-bold text-gray-900">Pending Faculty Applications</h2>
                <p className="text-xs text-gray-500">
                  Review applicant details and self-submitted teaching courses, then approve or reject the request.
                </p>
              </div>

              {pendingTeachers.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">All caught up!</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    There are no faculty registration requests waiting for review. New registrations will appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingTeachers.map((t) => {
                    const isApproving = actionLoading[t.id] === 'approving';
                    const isRejecting = actionLoading[t.id] === 'rejecting';
                    const isBusy = Boolean(actionLoading[t.id]);
                    const assignments = t.teaching_assignments || [];

                    return (
                      <div
                        key={t.id}
                        className="border border-gray-200 rounded-xl p-5 hover:border-[#9E2A3B]/40 transition-all bg-[#FAFAFA] flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="text-sm font-bold text-[#9E2A3B]">
                                {t.profile?.full_name || 'Faculty Applicant'}
                              </h4>
                              <p className="text-xs text-gray-600">{t.email}</p>
                            </div>
                            <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              PENDING
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 bg-white p-3 rounded-lg border border-gray-200 mb-3">
                            <div>
                              <span className="text-gray-400 block text-[10px]">ERP ID</span>
                              <span className="font-semibold">{t.profile?.erp_id || t.profile?.staff_id || '—'}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Department</span>
                              <span className="font-semibold">{t.profile?.department || '—'}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Designation</span>
                              <span className="font-semibold">{t.profile?.designation || '—'}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Applied</span>
                              <span>
                                {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                          </div>

                          {/* Submitted Teaching Assignments */}
                          <div className="mb-4">
                            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                              <Layers className="w-3 h-3 text-[#9E2A3B]" />
                              Submitted Teaching Courses ({assignments.length}):
                            </span>
                            {assignments.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No courses submitted</p>
                            ) : (
                              <div className="space-y-1.5">
                                {assignments.map((a, idx) => {
                                  const yr = a.academic_year || a.academicYear || a.year || 'Course';
                                  const subj = a.subject || a.subject_name;
                                  const divs = (a.divisions || []).join(', ');

                                  return (
                                    <div
                                      key={idx}
                                      className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800"
                                    >
                                      <span className="font-semibold text-[#9E2A3B]">{yr}</span> &bull;{' '}
                                      <span>{subj}</span>{' '}
                                      <span className="text-gray-500 font-medium">
                                        (Div: {divs || 'None'})
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons: Approve Faculty & Reject */}
                        <div className="flex gap-2 pt-3 border-t border-gray-200">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveFaculty(t)}
                            className="flex-1 py-2 px-3 bg-[#9E2A3B] hover:bg-[#8E1E2D] active:scale-[0.99] text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isApproving ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Approving...
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Approve Faculty
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRejectFaculty(t)}
                            className="py-2 px-3 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            {isRejecting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <X className="w-3.5 h-3.5" />
                                Reject
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: Approved Faculty Directory (Department Grid & Directory) ── */}
        {activeTab === 'teachers' && (
          <div className="space-y-6 animate-fade-in">
            {/* Main Container */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 sm:p-6 space-y-6">
              {/* Directory Header & Overall Stats */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#9E2A3B]" />
                    Approved Faculty Directory
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Browse verified institutional faculty by academic department, manage status, and review course mappings.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-semibold px-3 py-1 bg-[#9E2A3B]/10 text-[#9E2A3B] rounded-full border border-[#9E2A3B]/20">
                    Total Approved: {approvedTeachers.length} Faculty
                  </span>
                </div>
              </div>

              {/* Global Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  placeholder="Search faculty across departments by name, email address, or ERP ID..."
                  className="w-full pl-10 pr-24 py-2.5 text-xs bg-gray-50/70 hover:bg-gray-50 focus:bg-white border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B] transition-all"
                />
                {facultySearch && (
                  <button
                    type="button"
                    onClick={() => setFacultySearch('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <span className="text-[11px] font-medium hidden sm:inline">Clear</span>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Active Search Summary Banner */}
              {facultySearch.trim() && (
                <div className="flex items-center justify-between gap-2 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>
                      Found <strong>{totalMatchingCount}</strong> matching faculty across departments for &ldquo;<strong>{facultySearch}</strong>&rdquo;
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFacultySearch('')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              {/* ── 1. Department Grid Section ── */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#9E2A3B]" />
                      Academic Departments
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      Select any department card below to filter faculty details.
                    </p>
                  </div>

                  {/* All Departments Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedDepartment('ALL')}
                    aria-pressed={selectedDepartment === 'ALL'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedDepartment === 'ALL'
                        ? 'bg-[#9E2A3B] text-white shadow-xs ring-2 ring-[#9E2A3B]/20'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>All Departments</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        selectedDepartment === 'ALL'
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {approvedTeachers.length}
                    </span>
                  </button>
                </div>

                {/* The Responsive Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {DEPARTMENTS.map((deptName) => {
                    const IconComp = DEPARTMENT_ICONS[deptName] || Building2;
                    const allCount = facultyByDept[deptName]?.length || 0;
                    const matchCount = matchingFacultyByDept[deptName]?.length || 0;
                    const isSelected = selectedDepartment === deptName;
                    const isSearching = Boolean(facultySearch.trim());

                    return (
                      <button
                        key={deptName}
                        type="button"
                        onClick={() => setSelectedDepartment(deptName)}
                        aria-pressed={isSelected}
                        className={`group relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#9E2A3B] focus:ring-offset-2 min-h-[140px] sm:min-h-[150px] ${
                          isSelected
                            ? 'border-[#9E2A3B] bg-gradient-to-b from-[#9E2A3B]/8 to-[#9E2A3B]/2 ring-2 ring-[#9E2A3B]/30 shadow-xs'
                            : isSearching && matchCount > 0
                            ? 'border-emerald-300 bg-emerald-50/20 hover:border-[#9E2A3B]/50 hover:shadow-xs hover:-translate-y-0.5'
                            : isSearching && matchCount === 0
                            ? 'border-gray-200 bg-white opacity-55 hover:opacity-100 hover:border-gray-300'
                            : 'border-gray-200 bg-white hover:border-[#9E2A3B]/40 hover:bg-gray-50/50 hover:shadow-xs hover:-translate-y-0.5'
                        }`}
                      >
                        {/* Top row: Department Icon & Counter / Match Badge */}
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                              isSelected
                                ? 'bg-[#9E2A3B] text-white shadow-xs'
                                : 'bg-[#9E2A3B]/10 text-[#9E2A3B] group-hover:bg-[#9E2A3B] group-hover:text-white'
                            }`}
                          >
                            <IconComp className="w-4.5 h-4.5" />
                          </div>

                          {isSearching ? (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                matchCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                            >
                              {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                            </span>
                          ) : (
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                isSelected
                                  ? 'bg-[#9E2A3B] text-white border-[#9E2A3B]'
                                  : allCount > 0
                                  ? 'bg-gray-100 text-gray-700 border-gray-200 group-hover:bg-[#9E2A3B]/10 group-hover:text-[#9E2A3B]'
                                  : 'bg-gray-50 text-gray-400 border-gray-200'
                              }`}
                            >
                              {allCount}
                            </span>
                          )}
                        </div>

                        {/* Middle: Department Name */}
                        <div className="my-2 flex-1 flex items-center">
                          <h4
                            className={`text-xs sm:text-sm font-bold leading-snug line-clamp-2 transition-colors ${
                              isSelected ? 'text-[#9E2A3B]' : 'text-gray-900 group-hover:text-[#9E2A3B]'
                            }`}
                          >
                            {deptName}
                          </h4>
                        </div>

                        {/* Bottom Row: Count label & active indicator */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs w-full">
                          <span className="text-gray-500 font-medium text-[11px] sm:text-xs">
                            {allCount} {allCount === 1 ? 'Faculty' : 'Faculty'}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E2A3B] bg-[#9E2A3B]/10 px-1.5 py-0.5 rounded">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Unassigned / Legacy Faculty Warning (if any exist) */}
              {unassignedFaculty.length > 0 && (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Unassigned / Legacy Faculty Detected ({unassignedFaculty.length})
                      </h3>
                    </div>
                    <span className="text-[10px] font-semibold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full">
                      Action Required
                    </span>
                  </div>
                  <p className="text-xs text-amber-800">
                    The following verified faculty records do not have an official department mapping. Please assign each member to one of the 9 official departments:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {unassignedFaculty.map((t) => (
                      <div
                        key={t.id}
                        className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate">
                            {t.profile?.full_name || t.email}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-mono mt-0.5 truncate">
                            ERP ID: {t.profile?.erp_id || t.profile?.staff_id || 'N/A'} &bull; {t.email}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenReassignModal(t)}
                          className="px-2.5 py-1 text-xs font-semibold bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white rounded-lg transition-colors cursor-pointer flex-shrink-0"
                        >
                          Assign Dept
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 2. Dedicated Faculty Directory Section Below Grid ── */}
              <div className="pt-2 border-t border-gray-100 space-y-4">
                {/* Directory Header with Selected Department, Counts & Reset Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#9E2A3B]/10 text-[#9E2A3B] flex items-center justify-center flex-shrink-0 font-bold">
                      {selectedDepartment === 'ALL' ? (
                        <Layers className="w-4 h-4" />
                      ) : (
                        (() => {
                          const IconComp = DEPARTMENT_ICONS[selectedDepartment] || Building2;
                          return <IconComp className="w-4 h-4" />;
                        })()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900 truncate">
                          {selectedDepartment === 'ALL' ? 'All Departments' : selectedDepartment}
                        </h3>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-gray-700 border border-gray-200 shadow-2xs">
                          {displayedFaculty.length} {displayedFaculty.length === 1 ? 'Faculty' : 'Faculty'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {selectedDepartment === 'ALL'
                          ? `Displaying approved faculty across all institutional departments${facultySearch.trim() ? ` matching "${facultySearch}"` : ''}`
                          : `Displaying approved faculty under ${selectedDepartment}${facultySearch.trim() ? ` matching "${facultySearch}"` : ''}`}
                      </p>
                    </div>
                  </div>

                  {/* Filter / Reset Controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedDepartment !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setSelectedDepartment('ALL')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#9E2A3B] bg-[#9E2A3B]/10 hover:bg-[#9E2A3B]/20 rounded-lg border border-[#9E2A3B]/20 transition-all cursor-pointer shadow-2xs"
                        title="Reset to All Departments"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Show All Departments</span>
                      </button>
                    )}
                    {facultySearch.trim() && (
                      <button
                        type="button"
                        onClick={() => setFacultySearch('')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-all cursor-pointer"
                        title="Clear search text"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Clear Search</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Faculty Cards or Empty State */}
                {displayedFaculty.length === 0 ? (
                  facultySearch.trim() ? (
                    /* Search Empty State */
                    <div className="py-12 px-6 text-center rounded-2xl bg-gray-50/70 border border-dashed border-gray-200 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-800">
                          No matching approved faculty found
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                          No approved faculty in {selectedDepartment === 'ALL' ? 'any department' : selectedDepartment} matched &ldquo;{facultySearch}&rdquo;.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setFacultySearch('')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Clear Search
                        </button>
                        {selectedDepartment !== 'ALL' && (
                          <button
                            type="button"
                            onClick={() => setSelectedDepartment('ALL')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#9E2A3B] bg-[#9E2A3B]/10 hover:bg-[#9E2A3B]/20 rounded-lg border border-[#9E2A3B]/20 transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Search All Departments
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Department Empty State */
                    <div className="py-12 px-6 text-center rounded-2xl bg-gray-50/70 border border-dashed border-gray-200 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-800">
                          No approved faculty registered in this department yet.
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                          When faculty members select {selectedDepartment} during registration and are approved by an administrator, their profiles will automatically appear here.
                        </p>
                      </div>
                      {selectedDepartment !== 'ALL' && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDepartment('ALL')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#9E2A3B] bg-[#9E2A3B]/10 hover:bg-[#9E2A3B]/20 rounded-lg border border-[#9E2A3B]/20 transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Return to All Departments
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* Faculty Profile Cards List */
                  <div className="space-y-4">
                    {displayedFaculty.map((t) => {
                      const assignments = t.teaching_assignments || [];
                      const initial = t.profile?.full_name?.charAt(0) || 'F';
                      const isActive = t.status === 'APPROVED';
                      const dept = t.profile?.department || 'Unassigned';

                      return (
                        <div
                          key={t.id}
                          className="border border-gray-200 rounded-xl p-5 bg-white hover:border-[#9E2A3B]/30 hover:shadow-xs transition-all space-y-4"
                        >
                          {/* Faculty Profile Summary */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5">
                              <div className="w-11 h-11 rounded-xl bg-[#9E2A3B]/10 text-[#9E2A3B] font-bold flex items-center justify-center text-base border border-[#9E2A3B]/20 flex-shrink-0 mt-0.5">
                                {initial}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold text-gray-900">
                                    {t.profile?.full_name || t.email}
                                  </h4>
                                  <span
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                      isActive
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-red-50 text-red-700 border-red-200'
                                    }`}
                                  >
                                    {isActive ? 'Active' : t.status || 'Inactive'}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-gray-800">{dept}</span>
                                  <span className="text-gray-300">&bull;</span>
                                  <span>{t.profile?.designation || 'Faculty'}</span>
                                  <span className="text-gray-300">&bull;</span>
                                  <span className="font-mono text-gray-700 font-semibold bg-gray-100 px-2 py-0.5 rounded text-[11px] border border-gray-200">
                                    ERP ID: {t.profile?.erp_id || t.profile?.staff_id || 'N/A'}
                                  </span>
                                </p>
                                <p className="text-[11px] text-gray-500 font-mono mt-1">
                                  {t.email}
                                </p>
                              </div>
                            </div>

                            {/* Admin Actions: Change Dept & Deactivate/Activate */}
                            <div className="flex items-center gap-2 self-end sm:self-start">
                              <button
                                type="button"
                                onClick={() => handleOpenReassignModal(t)}
                                title="Reassign official department"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:text-[#9E2A3B] bg-gray-50 hover:bg-[#9E2A3B]/10 border border-gray-200 hover:border-[#9E2A3B]/30 rounded-lg transition-all cursor-pointer shadow-2xs"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-[#9E2A3B]" />
                                <span>Change Dept</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleFacultyStatus(t)}
                                title={isActive ? 'Deactivate faculty' : 'Reactivate faculty'}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs border ${
                                  isActive
                                    ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                                    : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                                }`}
                              >
                                {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Read-Only Teaching Assignment Badges */}
                          <div className="pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                              <BookOpen className="w-3.5 h-3.5 text-[#9E2A3B]" />
                              <span>Registered Courses & Divisions ({assignments.length}):</span>
                            </div>

                            {assignments.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">
                                No teaching courses mapped yet.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {assignments.map((a, idx) => {
                                  const yr =
                                    a.academic_year || a.academicYear || a.year || 'Academic Year';
                                  const subj = a.subject || a.subject_name;
                                  const divs = (a.divisions || []).join(', ');

                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-800"
                                    >
                                      <strong className="text-[#9E2A3B] font-semibold mr-1">
                                        {yr}
                                      </strong>{' '}
                                      &bull; <span className="mx-1">{subj}</span>{' '}
                                      <span className="text-gray-500 font-medium">
                                        (Div: {divs || 'None'})
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* ── Reassign Department Modal ───────────────────────── */}
      {reassignModal.isOpen && reassignModal.teacher && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setReassignModal({ isOpen: false, teacher: null, targetDept: '', loading: false })}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2 text-[#9E2A3B] font-bold text-sm">
                <Building2 className="w-4 h-4" />
                <span>Reassign Faculty Department</span>
              </div>
              <button
                type="button"
                onClick={() => setReassignModal({ isOpen: false, teacher: null, targetDept: '', loading: false })}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1.5 text-xs">
                <div className="font-bold text-gray-900 text-sm">
                  {reassignModal.teacher.profile?.full_name || reassignModal.teacher.email}
                </div>
                <div className="text-gray-600">
                  Current Department:{' '}
                  <span className="font-semibold text-gray-800">
                    {reassignModal.teacher.profile?.department || 'Unassigned'}
                  </span>
                </div>
                <div className="text-gray-600">
                  ERP ID:{' '}
                  <span className="font-mono font-semibold text-gray-800">
                    {reassignModal.teacher.profile?.erp_id || reassignModal.teacher.profile?.staff_id || 'N/A'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Select New Official Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={reassignModal.targetDept}
                  onChange={(e) => setReassignModal((prev) => ({ ...prev, targetDept: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#9E2A3B]/20 focus:border-[#9E2A3B]"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  The directory and department counts will update immediately upon authorization.
                </p>
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={reassignModal.loading}
                  onClick={() => setReassignModal({ isOpen: false, teacher: null, targetDept: '', loading: false })}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reassignModal.loading || !reassignModal.targetDept}
                  onClick={handleSaveReassignDepartment}
                  className="px-4 py-2 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {reassignModal.loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Authorize Change
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
