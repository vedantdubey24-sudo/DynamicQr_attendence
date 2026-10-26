import React, { useState, useEffect } from 'react';
import { X, Lock, CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import AssignmentBuilder from './AssignmentBuilder';
import { DEPARTMENTS, DESIGNATIONS } from '../constants/catalogue';
import { teacherApi } from '../services/api';

export default function TeacherProfileSettingsModal({
  isOpen,
  onClose,
  initialProfile,
  initialGroupedAssignments,
  onSaveSuccess,
}) {
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen && initialProfile) {
      setDepartment(initialProfile.department || 'Computer Engineering');
      setDesignation(initialProfile.designation || 'Assistant Professor');

      // Populate assignments if available
      if (initialGroupedAssignments && initialGroupedAssignments.length > 0) {
        setAssignments(
          initialGroupedAssignments.map((a) => ({
            academicYear: a.academic_year || a.year || 'TE — 3rd Year',
            year: a.academic_year || a.year || 'TE — 3rd Year',
            subject: a.subject || a.subject_name || '',
            divisions: a.divisions || ['A'],
          }))
        );
      } else {
        setAssignments([
          {
            academicYear: 'TE — 3rd Year',
            year: 'TE — 3rd Year',
            subject: 'Database Management Systems (DBMS)',
            divisions: ['A', 'B'],
          },
        ]);
      }
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen, initialProfile, initialGroupedAssignments]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!department || !designation) {
      setError('Department and Designation are required.');
      return;
    }

    if (!assignments || assignments.length === 0) {
      setError('Please add at least one teaching course.');
      return;
    }

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (!a.subject || !a.subject.trim()) {
        setError(`Please select a subject for course #${i + 1}.`);
        return;
      }
      if (!a.divisions || a.divisions.length === 0) {
        setError(`Please select at least one division for ${a.subject}.`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        department,
        designation,
        teaching_assignments: assignments,
      };

      const res = await teacherApi.updateProfile(payload);
      setSuccessMsg('Profile and teaching courses updated successfully.');

      if (onSaveSuccess) {
        onSaveSuccess(res.data);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Edit Faculty Profile & Teaching Courses
            </h3>
            <p className="text-xs text-gray-500">
              Update your department, designation, and self-managed course mapping.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Locked Identity Information */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Institutional Identity (Locked)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-500 font-medium mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-gray-400" />
                  Registered Email
                </label>
                <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-mono">
                  {initialProfile?.email || '—'}
                </div>
              </div>
              <div>
                <label className="block text-gray-500 font-medium mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-gray-400" />
                  ERP ID
                </label>
                <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700 font-mono font-semibold">
                  {initialProfile?.erp_id || initialProfile?.staff_id || '—'}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Email and ERP ID are verified institutional identifiers and can only be modified by an administrator.
            </p>
          </div>

          {/* Editable Details: Department and Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
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
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                Designation <span className="text-red-500">*</span>
              </label>
              <select
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
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

          {/* Dynamic Assignment Builder */}
          <div className="pt-2">
            <AssignmentBuilder
              assignments={assignments}
              onChange={setAssignments}
              disabled={loading}
            />
          </div>

          {/* Modal Footer CTA */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-[#9E2A3B] hover:bg-[#8E1E2D] text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
