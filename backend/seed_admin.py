"""
Seed Admin Script — Creates the initial admin user with a hashed password.
Run this once after setting up the database.

Usage:
    python seed_admin.py
"""

import os
import sys

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from werkzeug.security import generate_password_hash
from app import create_app, db
from app.models import User, AcademicYear, Class, Division, Subject


def seed_admin():
    app = create_app()
    with app.app_context():
        # Ensure all tables exist
        db.create_all()

        # Check if admin already exists
        admin = User.query.filter_by(email='admin@institution.edu', role='ADMIN').first()
        if admin:
            print('Admin user already exists.')
            return

        # Create admin with hashed password
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
        admin = User(
            email='admin@institution.edu',
            role='ADMIN',
            password_hash=generate_password_hash(admin_password),
            status='APPROVED',
        )
        db.session.add(admin)
        db.session.commit()

        print(f'Admin user created:')
        print(f'  Email: admin@institution.edu')
        print(f'  Password: {admin_password}')
        print(f'  (Change this password in production!)')


def seed_academic_data():
    app = create_app()
    with app.app_context():
        # Ensure year exists
        year = AcademicYear.query.filter_by(year_name='2025-2026').first()
        if not year:
            year = AcademicYear(year_name='2025-2026', is_active=True)
            db.session.add(year)
            db.session.flush()

        # Seed catalogue classes: FE, SE, TE, BE
        from app.constants import COURSE_CATALOGUE, AVAILABLE_DIVISIONS

        for class_title in COURSE_CATALOGUE.keys():
            cls = Class.query.filter_by(class_name=class_title, academic_year_id=year.id).first()
            if not cls:
                cls = Class(class_name=class_title, academic_year_id=year.id)
                db.session.add(cls)
                db.session.flush()

            # Seed divisions A, B, C
            for div_name in AVAILABLE_DIVISIONS:
                div = Division.query.filter_by(division_name=div_name, class_id=cls.id).first()
                if not div:
                    db.session.add(Division(division_name=div_name, class_id=cls.id))

            # Seed subjects for this class
            for idx, subj_name in enumerate(COURSE_CATALOGUE[class_title]):
                subj = Subject.query.filter_by(subject_name=subj_name).first()
                if not subj:
                    code_prefix = class_title[:2]  # FE, SE, TE, BE
                    code = f"{code_prefix}-{idx+101}"
                    db.session.add(Subject(subject_name=subj_name, subject_code=code))

        db.session.commit()
        print('Institutional academic catalogue seeded successfully.')


def seed_departments_and_migrate():
    """Ensure departments table exists, 9 departments are seeded, and existing faculty are linked."""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), 'instance', 'attendance.db')
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(teacher_profiles);")
        cols = [r[1] for r in cur.fetchall()]
        if 'department_id' not in cols and len(cols) > 0:
            cur.execute("ALTER TABLE teacher_profiles ADD COLUMN department_id INTEGER REFERENCES departments(id);")
            conn.commit()
            print("Added department_id column to teacher_profiles table via SQLite.")
        conn.close()

    app = create_app()
    with app.app_context():
        # Ensure tables exist
        db.create_all()

        from app.models import Department, TeacherProfile

        # The 9 Official Institutional Departments
        OFFICIAL_DEPTS = [
            ('Artificial Intelligence & Data Science', 'AIDS'),
            ('Computer Engineering', 'COMP'),
            ('Information Technology', 'IT'),
            ('Electronics & Telecommunication', 'ENTC'),
            ('Mechanical Engineering', 'MECH'),
            ('Civil Engineering', 'CIVIL'),
            ('First Year Department', 'FE'),
            ('Automation and Robotics', 'AR'),
            ('Instrumentation Engineering', 'INST'),
        ]

        dept_map = {}
        for name, code in OFFICIAL_DEPTS:
            dept = Department.query.filter_by(name=name).first()
            if not dept:
                dept = Department(name=name, code=code)
                db.session.add(dept)
                db.session.flush()
                print(f"Created department: {name} ({code})")
            dept_map[name.lower()] = dept
            dept_map[name] = dept

        db.session.commit()

        # Safe normalization mapping for historical variants
        normalization = {
            'artificial intelligence and data science': 'Artificial Intelligence & Data Science',
            'ai & ds': 'Artificial Intelligence & Data Science',
            'computer science': 'Computer Engineering',
            'computer engineering': 'Computer Engineering',
            'information technology': 'Information Technology',
            'it': 'Information Technology',
            'electronics and telecommunication': 'Electronics & Telecommunication',
            'electronics & telecommunication': 'Electronics & Telecommunication',
            'entc': 'Electronics & Telecommunication',
            'mechanical engineering': 'Mechanical Engineering',
            'mech': 'Mechanical Engineering',
            'civil engineering': 'Civil Engineering',
            'civil': 'Civil Engineering',
            'first year department': 'First Year Department',
            'fe': 'First Year Department',
            'automation and robotics': 'Automation and Robotics',
            'instrumentation engineering': 'Instrumentation Engineering',
        }

        # Backfill existing profiles
        profiles = TeacherProfile.query.all()
        for p in profiles:
            norm_key = (p.department or '').strip().lower()
            target_name = normalization.get(norm_key)
            if target_name and target_name in dept_map:
                target_dept = dept_map[target_name]
                p.department = target_dept.name
                p.department_id = target_dept.id
                print(f"Linked profile {p.full_name} -> {target_dept.name}")

        db.session.commit()
        print('Departments verified and existing faculty mapped successfully.')


if __name__ == '__main__':
    seed_departments_and_migrate()
    seed_admin()
    seed_academic_data()
