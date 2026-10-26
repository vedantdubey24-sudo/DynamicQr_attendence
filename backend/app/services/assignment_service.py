"""
Assignment Service — Helper functions for resolving and persisting teaching assignments.
"""

from app import db
from app.models import Class, Division, Subject, TeacherAssignment, AcademicYear
from app.constants import COURSE_CATALOGUE, AVAILABLE_DIVISIONS, ACADEMIC_YEARS


class AssignmentService:
    @staticmethod
    def normalize_year_name(raw_year: str) -> str:
        """Normalize varied year label strings (e.g. '3rd Year (TE)' -> 'TE — 3rd Year')."""
        if not raw_year:
            return 'FE — 1st Year'
        raw = raw_year.strip()
        for y in ACADEMIC_YEARS:
            if y.lower() == raw.lower():
                return y
            # Check substrings like 'FE', 'SE', 'TE', 'BE' or '1st', '2nd', '3rd', '4th'
            prefix = y.split('—')[0].strip()
            if prefix.lower() in raw.lower():
                return y
        return raw

    @classmethod
    def save_teacher_assignments(cls, teacher_id: int, assignments_data: list) -> list:
        """
        Parses teaching assignments list from registration or profile update
        and updates TeacherAssignment records for teacher_id.
        Replaces previous assignments.
        """
        if not assignments_data:
            return []

        # Find or create default academic year
        year_record = AcademicYear.query.filter_by(year_name='2025-2026').first()
        if not year_record:
            year_record = AcademicYear(year_name='2025-2026', is_active=True)
            db.session.add(year_record)
            db.session.flush()

        # Remove existing assignments for this teacher
        TeacherAssignment.query.filter_by(teacher_id=teacher_id).delete()

        created_assignments = []
        added_combinations = set()

        for item in assignments_data:
            raw_year = item.get('academicYear') or item.get('academic_year') or item.get('year') or ''
            subject_name = (item.get('subject') or item.get('subject_name') or '').strip()
            divisions = item.get('divisions') or []

            if not raw_year or not subject_name or not divisions:
                continue

            year_name = cls.normalize_year_name(raw_year)

            # Find or create Class
            cls_obj = Class.query.filter_by(class_name=year_name, academic_year_id=year_record.id).first()
            if not cls_obj:
                cls_obj = Class(class_name=year_name, academic_year_id=year_record.id)
                db.session.add(cls_obj)
                db.session.flush()

            # Find or create Subject
            subj_obj = Subject.query.filter_by(subject_name=subject_name).first()
            if not subj_obj:
                code_prefix = year_name[:2]
                subj_obj = Subject(subject_name=subject_name, subject_code=f"{code_prefix}-{len(subject_name)}")
                db.session.add(subj_obj)
                db.session.flush()

            # For each division
            for div_name in divisions:
                div_name = str(div_name).strip().upper()
                if not div_name:
                    continue

                div_obj = Division.query.filter_by(division_name=div_name, class_id=cls_obj.id).first()
                if not div_obj:
                    div_obj = Division(division_name=div_name, class_id=cls_obj.id)
                    db.session.add(div_obj)
                    db.session.flush()

                combo_key = (cls_obj.id, div_obj.id, subj_obj.id)
                if combo_key in added_combinations:
                    continue
                added_combinations.add(combo_key)

                assignment = TeacherAssignment(
                    teacher_id=teacher_id,
                    class_id=cls_obj.id,
                    division_id=div_obj.id,
                    subject_id=subj_obj.id,
                )
                db.session.add(assignment)
                created_assignments.append(assignment)

        db.session.flush()
        return created_assignments

    @classmethod
    def get_grouped_teaching_assignments(cls, teacher_id: int) -> list:
        """
        Returns teaching assignments grouped by (academic_year, subject) with divisions list.
        Example:
        [
          {
            "year": "TE — 3rd Year",
            "academicYear": "TE — 3rd Year",
            "subject": "Database Management Systems (DBMS)",
            "divisions": ["A", "B"]
          }
        ]
        """
        assignments = TeacherAssignment.query.filter_by(teacher_id=teacher_id).all()
        grouped = {}

        for a in assignments:
            year_name = a.class_rel.class_name if a.class_rel else 'FE — 1st Year'
            subject_name = a.subject_rel.subject_name if a.subject_rel else 'Subject'
            div_name = a.division_rel.division_name if a.division_rel else 'A'

            key = (year_name, subject_name)
            if key not in grouped:
                grouped[key] = {
                    'year': year_name,
                    'academicYear': year_name,
                    'subject': subject_name,
                    'subject_code': a.subject_rel.subject_code if a.subject_rel else '',
                    'divisions': [],
                }
            if div_name not in grouped[key]['divisions']:
                grouped[key]['divisions'].append(div_name)

        # Sort divisions
        for g in grouped.values():
            g['divisions'].sort()

        return list(grouped.values())
