import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Lock,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { DEPARTMENTS, DESIGNATIONS } from '../constants/catalogue';
import AssignmentBuilder from './AssignmentBuilder';
import { teacherApi } from '../services/api';

export default function EditCourseSettingsModal({
  isOpen,
  onClose,
  initialProfile,
  assignments: flatAssignments = [],
  groupedAssignments = [],
  onSaveSuccess,
}) {
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [courseAssignments, setCourseAssignments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Initialize form when opened or props change
  useEffect(() => {
    if (isOpen) {
      const activeDept =
        initialProfile?.department || 'Artificial Intelligence & Data Science';
      const activeDesig = initialProfile?.designation || 'Assistant Professor';

      setDepartment(activeDept);
      setDesignation(activeDesig);

      // Prioritize groupedAssignments if provided and not empty
      if (groupedAssignments && groupedAssignments.length > 0) {
        setCourseAssignments(
          groupedAssignments.map((a) => ({
            academicYear: a.academic_year || a.year || a.academicYear || 'TE — 3rd Year',
            year: a.academic_year || a.year || a.academicYear || 'TE — 3rd Year',
            subject: a.subject || a.subject_name || '',
            divisions:
              a.divisions && a.divisions.length > 0
                ? a.divisions
                : ['A', 'B'],
          }))
        );
      } else if (flatAssignments && flatAssignments.length > 0) {
        // Group flat assignments by (class_name, subject_name)
        const groupedMap = {};
        flatAssignments.forEach((fa) => {
          const yr = fa.class_name || 'TE — 3rd Year';
          const subj = fa.subject_name || 'Course';
          const div = fa.division_name || 'A';
          const key = `${yr}__${subj}`;
          if (!groupedMap[key]) {
            groupedMap[key] = {
              academicYear: yr,
              year: yr,
              subject: subj,
              divisions: [],
            };
          }
          if (!groupedMap[key].divisions.includes(div)) {
            groupedMap[key].divisions.push(div);
          }
        });
        setCourseAssignments(Object.values(groupedMap));
      } else {
        // Fallback default
        setCourseAssignments([
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
  }, [isOpen, initialProfile, groupedAssignments, flatAssignments]);

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

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!department) {
      setError('Please select a department.');
      return;
    }

    if (!courseAssignments || courseAssignments.length === 0) {
      setError('Please configure at least one teaching course.');
      return;
    }

    for (let i = 0; i < courseAssignments.length; i++) {
      const c = courseAssignments[i];
      if (!c.subject || !c.subject.trim()) {
        setError(`Please select or enter a subject name for course #${i + 1}.`);
        return;
      }
      if (!c.divisions || c.divisions.length === 0) {
        setError(`Please select at least one division for course "${c.subject}".`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        department,
        designation,
        teaching_assignments: courseAssignments.map((ca) => ({
          year: ca.academicYear || ca.year || 'TE — 3rd Year',
          academicYear: ca.academicYear || ca.year || 'TE — 3rd Year',
          subject: ca.subject.trim(),
          divisions: ca.divisions,
        })),
      };

      await teacherApi.updateProfile(payload);

      setSuccessMsg('Department & teaching courses updated successfully!');
      if (onSaveSuccess) {
        onSaveSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 1100);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to save changes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#801428] to-[#9E2A3B] text-white flex items-center justify-between shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E6C687]" />
              <h2 className="text-lg font-bold tracking-tight text-white">
                Edit Department & Teaching Courses
              </h2>
            </div>
            <p className="text-xs text-white/80 mt-0.5">
              Customize your academic department, designation, and assigned subjects & divisions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs animate-fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* Institutional Identity Card */}
          <div className="p-3.5 bg-gray-50/90 border border-gray-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-gray-700">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-semibold text-gray-900">
                {initialProfile?.full_name || 'Faculty Member'}
              </span>
              <span className="text-gray-400">•</span>
              <span className="font-mono text-gray-600">
                {initialProfile?.erp_id || initialProfile?.staff_id || '#FAC-205'}
              </span>
            </div>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Institutional Account
            </span>
          </div>

          {/* Department and Designation Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Department */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#801428]" />
                <span>Department</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-[#801428]/20 focus:border-[#801428] transition-colors font-medium cursor-pointer"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Designation */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#801428]" />
                <span>Designation</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-white border border-gray-300 rounded-xl text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-[#801428]/20 focus:border-[#801428] transition-colors font-medium cursor-pointer"
                >
                  {DESIGNATIONS.map((desig) => (
                    <option key={desig} value={desig}>
                      {desig}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Dynamic Teaching Courses & Divisions Builder */}
          <div className="pt-2 border-t border-gray-100">
            <AssignmentBuilder
              assignments={courseAssignments}
              onChange={setCourseAssignments}
              disabled={loading}
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-[#801428] hover:bg-[#6c1122] text-white font-semibold text-xs tracking-wide rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Updates...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
