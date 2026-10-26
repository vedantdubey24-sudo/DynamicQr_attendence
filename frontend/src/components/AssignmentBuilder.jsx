import React, { useState } from 'react';
import { Plus, Trash2, BookOpen, Layers, CheckSquare, Edit2, ListFilter } from 'lucide-react';
import { ACADEMIC_YEARS, COURSE_CATALOGUE, AVAILABLE_DIVISIONS } from '../constants/catalogue';

export default function AssignmentBuilder({
  assignments = [],
  onChange,
  disabled = false,
  error = null,
}) {
  const [customModeMap, setCustomModeMap] = useState({});

  const handleAddRow = () => {
    const newRow = {
      academicYear: 'TE — 3rd Year',
      year: 'TE — 3rd Year',
      subject: '',
      divisions: [...AVAILABLE_DIVISIONS], // default to all divisions
    };
    onChange([...assignments, newRow]);
  };

  const handleRemoveRow = (index) => {
    if (assignments.length <= 1) return;
    const updated = assignments.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleYearChange = (index, newYear) => {
    const updated = [...assignments];
    const current = updated[index];
    const validSubjects = COURSE_CATALOGUE[newYear] || [];
    const isCustom = customModeMap[index];
    const keepSubject = isCustom || validSubjects.includes(current.subject) ? current.subject : '';

    updated[index] = {
      ...current,
      academicYear: newYear,
      year: newYear,
      subject: keepSubject,
    };
    onChange(updated);
  };

  const handleSubjectChange = (index, newSubject) => {
    if (newSubject === '__custom__') {
      setCustomModeMap((prev) => ({ ...prev, [index]: true }));
      const updated = [...assignments];
      updated[index] = { ...updated[index], subject: '' };
      onChange(updated);
      return;
    }

    const updated = [...assignments];
    updated[index] = {
      ...updated[index],
      subject: newSubject,
    };
    onChange(updated);
  };

  const handleToggleDivision = (index, div) => {
    const updated = [...assignments];
    const currentDivs = updated[index].divisions || [];
    let nextDivs;
    if (currentDivs.includes(div)) {
      if (currentDivs.length === 1) return; // Keep at least one
      nextDivs = currentDivs.filter((d) => d !== div);
    } else {
      nextDivs = [...currentDivs, div].sort();
    }
    updated[index] = {
      ...updated[index],
      divisions: nextDivs,
    };
    onChange(updated);
  };

  const handleSelectAllDivisions = (index) => {
    const updated = [...assignments];
    const currentDivs = updated[index].divisions || [];
    const allSelected = AVAILABLE_DIVISIONS.every((d) => currentDivs.includes(d));

    updated[index] = {
      ...updated[index],
      divisions: allSelected ? ['A'] : [...AVAILABLE_DIVISIONS],
    };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-800">
          Teaching Courses & Subject Mapping <span className="text-red-500">*</span>
        </label>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {assignments.length} {assignments.length === 1 ? 'course' : 'courses'} configured
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-3.5">
        {assignments.map((assignment, index) => {
          const selectedYear = assignment.academicYear || assignment.year || 'TE — 3rd Year';
          const availableSubjects = COURSE_CATALOGUE[selectedYear] || [];
          const selectedDivisions = assignment.divisions || [];
          const isAllSelected = AVAILABLE_DIVISIONS.every((d) => selectedDivisions.includes(d));
          const isCustom = customModeMap[index] || (assignment.subject && !availableSubjects.includes(assignment.subject));

          return (
            <div
              key={index}
              className="p-4 bg-white border border-gray-200/90 rounded-xl shadow-xs hover:border-gray-300 transition-all space-y-3.5"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-[#801428] font-bold">
                  <BookOpen className="w-4 h-4 text-[#D4A347]" />
                  Course #{index + 1}
                </span>
                {assignments.length > 1 && !disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    className="text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors text-xs font-medium cursor-pointer"
                    title="Remove Course"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Academic Year Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Academic Year
                  </label>
                  <select
                    value={selectedYear}
                    disabled={disabled}
                    onChange={(e) => handleYearChange(index, e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#801428]/20 focus:border-[#801428] transition-colors"
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Selection / Custom Subject */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-700">
                      Subject Name
                    </label>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setCustomModeMap((prev) => ({ ...prev, [index]: !isCustom }));
                      }}
                      className="text-[11px] text-[#801428] hover:underline font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {isCustom ? (
                        <>
                          <ListFilter className="w-3 h-3" />
                          <span>Choose from Catalogue</span>
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-3 h-3" />
                          <span>Custom Name</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isCustom ? (
                    <input
                      type="text"
                      disabled={disabled}
                      value={assignment.subject || ''}
                      onChange={(e) => handleSubjectChange(index, e.target.value)}
                      placeholder="e.g. Advanced Artificial Intelligence"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#801428]/20 focus:border-[#801428] transition-colors"
                    />
                  ) : (
                    <select
                      value={assignment.subject || ''}
                      disabled={disabled}
                      onChange={(e) => handleSubjectChange(index, e.target.value)}
                      className={`w-full px-3 py-2 text-sm bg-gray-50 border rounded-xl focus:ring-2 focus:ring-[#801428]/20 focus:border-[#801428] transition-colors ${
                        !assignment.subject ? 'border-amber-300 bg-amber-50/30' : 'border-gray-300'
                      }`}
                    >
                      <option value="">— Select a Subject —</option>
                      {availableSubjects.map((subj) => (
                        <option key={subj} value={subj}>
                          {subj}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter Custom Subject...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Division Multi-Toggle & Select All */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-gray-500" />
                    Divisions:
                  </label>
                  <span className="text-[11px] text-gray-500 font-medium">
                    {selectedDivisions.length === AVAILABLE_DIVISIONS.length
                      ? 'All divisions selected'
                      : `${selectedDivisions.length} selected`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Select All Divisions Button */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectAllDivisions(index)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      isAllSelected
                        ? 'bg-[#801428] text-white border-[#801428] shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{isAllSelected ? 'All Divisions (A, B, C)' : 'Choose All'}</span>
                  </button>

                  {/* Individual Division Buttons */}
                  {AVAILABLE_DIVISIONS.map((div) => {
                    const isSelected = selectedDivisions.includes(div);
                    return (
                      <button
                        key={div}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleToggleDivision(index, div)}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#801428]/10 text-[#801428] border-[#801428] font-bold'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        Div {div}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={handleAddRow}
          className="w-full py-2.5 px-4 border-2 border-dashed border-[#D4A347] bg-[#D4A347]/5 hover:bg-[#D4A347]/10 text-[#801428] font-semibold text-xs tracking-wide uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#D4A347]" />
          <span>+ Add Another Course</span>
        </button>
      )}
    </div>
  );
}

