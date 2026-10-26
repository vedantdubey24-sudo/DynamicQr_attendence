"""
Seed Admin & Academic Catalogue Script
Safely provisions the initial administrator account, the official departments,
and the institutional academic catalogue (years, classes, divisions, subjects).

Supports both PostgreSQL (Supabase/Production) and local MySQL.
Never prints or logs passwords, tokens, or credentials.
Safe to rerun (idempotent): preserves existing records and avoids duplicates.

Usage:
    python seed_admin.py                     # Interactive mode (checks target, prompts confirmation)
    python seed_admin.py --require-postgres  # Refuses to run unless dialect is PostgreSQL
    python seed_admin.py --yes               # Non-interactive mode (for Render Shell / automated runs)
"""

import os
import sys
import argparse
from dotenv import load_dotenv

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Load environment reliably from backend/.env if not already set
_backend_env = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_backend_env):
    load_dotenv(_backend_env)
else:
    load_dotenv()

from werkzeug.security import generate_password_hash
from sqlalchemy import text
from sqlalchemy.engine import make_url
from app import create_app, db
from app.models import (
    User, AcademicYear, Class, Division, Subject,
    Department, TeacherProfile
)
from app.constants import (
    COURSE_CATALOGUE, AVAILABLE_DIVISIONS, DEPARTMENTS
)


def get_sanitized_db_info(db_uri):
    """
    Extracts dialect, driver, host, and database name from URI
    without exposing username, password, or sensitive credentials.
    """
    try:
        url = make_url(db_uri)
        return {
            'dialect': url.get_backend_name(),
            'driver': url.get_driver_name(),
            'host': url.host or 'localhost',
            'port': url.port or 'default',
            'database': url.database or 'unknown',
        }
    except Exception:
        return {
            'dialect': 'unknown',
            'driver': 'unknown',
            'host': 'unknown',
            'port': 'unknown',
            'database': 'unknown',
        }


def seed_departments():
    """
    Seeds the 9 official institutional departments if missing.
    Idempotent and safe across PostgreSQL and MySQL.
    Does not execute SQLite-specific operations.
    """
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

    created_count = 0
    dept_map = {}

    for name, code in OFFICIAL_DEPTS:
        dept = Department.query.filter_by(name=name).first()
        if not dept:
            dept = Department(name=name, code=code)
            db.session.add(dept)
            db.session.flush()
            created_count += 1
        dept_map[name.lower()] = dept
        dept_map[name] = dept

    db.session.commit()

    # Map existing teacher profiles if any exist without department_id
    linked_count = 0
    profiles = TeacherProfile.query.filter(TeacherProfile.department_id.is_(None)).all()
    for p in profiles:
        norm_key = (p.department or '').strip().lower()
        matched = dept_map.get(norm_key)
        if matched:
            p.department = matched.name
            p.department_id = matched.id
            linked_count += 1

    if linked_count > 0:
        db.session.commit()

    print(f"  - Departments: {len(OFFICIAL_DEPTS)} verified ({created_count} new created, {linked_count} faculty profiles linked).")


def seed_academic_data():
    """
    Seeds the 2025-2026 academic year, classes (FE, SE, TE, BE),
    divisions (A, B, C), and subjects with unique subject codes.
    Idempotent and additive: never duplicates existing entries.
    """
    # 1. Academic Year
    year = AcademicYear.query.filter_by(year_name='2025-2026').first()
    if not year:
        year = AcademicYear(year_name='2025-2026', is_active=True)
        db.session.add(year)
        db.session.flush()

    classes_created = 0
    divisions_created = 0
    subjects_created = 0

    # 2. Classes, Divisions, and Subjects
    for class_title in COURSE_CATALOGUE.keys():
        cls = Class.query.filter_by(class_name=class_title, academic_year_id=year.id).first()
        if not cls:
            cls = Class(class_name=class_title, academic_year_id=year.id)
            db.session.add(cls)
            db.session.flush()
            classes_created += 1

        for div_name in AVAILABLE_DIVISIONS:
            div = Division.query.filter_by(division_name=div_name, class_id=cls.id).first()
            if not div:
                db.session.add(Division(division_name=div_name, class_id=cls.id))
                divisions_created += 1

        for idx, subj_name in enumerate(COURSE_CATALOGUE[class_title]):
            subj = Subject.query.filter_by(subject_name=subj_name).first()
            if not subj:
                code_prefix = class_title[:2]  # FE, SE, TE, BE
                code = f"{code_prefix}-{idx+101}"
                existing_code = Subject.query.filter_by(subject_code=code).first()
                if not existing_code:
                    db.session.add(Subject(subject_name=subj_name, subject_code=code))
                    subjects_created += 1

    db.session.commit()
    print(f"  - Academic Catalogue: Year 2025-2026 verified ({classes_created} classes, {divisions_created} divisions, {subjects_created} subjects added).")


def seed_admin():
    """
    Provisions the initial administrator account securely.
    Reads ADMIN_EMAIL and ADMIN_PASSWORD from environment variables.
    Requires ADMIN_PASSWORD to be explicitly configured.
    Checks for existing admin accounts and preserves them without modification.
    Never prints or logs passwords.
    """
    admin_email = os.getenv('ADMIN_EMAIL', 'admin@institution.edu').strip().lower()
    admin_password = os.getenv('ADMIN_PASSWORD')

    if not admin_password or not admin_password.strip():
        print("  - ERROR: 'ADMIN_PASSWORD' environment variable is required.")
        print("    Please set ADMIN_PASSWORD in your environment or .env before running initialization.")
        return False

    # Check if admin already exists by email or by ADMIN role
    existing_by_email = User.query.filter_by(email=admin_email).first()
    if existing_by_email:
        print(f"  - Admin record already exists for email '{admin_email}'. Preserving existing account without modification.")
        return True

    existing_admin = User.query.filter_by(role='ADMIN').first()
    if existing_admin:
        print(f"  - An administrator account already exists ({existing_admin.email}). Preserving existing record without modification.")
        return True

    # Create admin with hashed password
    admin = User(
        email=admin_email,
        role='ADMIN',
        password_hash=generate_password_hash(admin_password.strip()),
        status='APPROVED',
    )
    db.session.add(admin)
    db.session.commit()

    print("  - Admin account provisioned successfully.")
    print(f"    Email : {admin_email}")
    print("    Role  : ADMIN (Status: APPROVED)")
    return True


def run_initialization(require_postgres=False, auto_confirm=False):
    app = create_app()

    with app.app_context():
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        info = get_sanitized_db_info(db_uri)

        print("\n============================================================")
        print(" Database Initialization & Provisioning")
        print("============================================================")
        print(f" Dialect       : {info['dialect']} ({info['driver']})")
        print(f" Host          : {info['host']}:{info['port']}")
        print(f" Database      : {info['database']}")
        print("============================================================")

        # Dialect verification
        if require_postgres and info['dialect'] != 'postgresql':
            print(f"\nERROR: Target database dialect is '{info['dialect']}', but PostgreSQL was required.")
            print("Operation aborted to prevent unintended modifications to non-PostgreSQL databases.\n")
            sys.exit(1)

        # Test connection
        print("\n[1/4] Testing database connection...")
        try:
            db.session.execute(text("SELECT 1"))
            print("      Connection successful.")
        except Exception as conn_err:
            print(f"      ERROR: Failed to connect to database: {conn_err}")
            print("      Please verify your connection URL and network access.\n")
            sys.exit(1)

        # Confirmation prompt
        if not auto_confirm:
            print(f"\nYou are about to initialize admin and academic data on '{info['dialect']}' ({info['host']}).")
            confirm = input("Proceed with data initialization? [y/N]: ").strip().lower()
            if confirm not in ('y', 'yes'):
                print("Operation cancelled by user.")
                sys.exit(0)

        # Ensure all tables exist (safe DDL: CREATE TABLE IF NOT EXISTS)
        print("\n[2/4] Verifying database schema...")
        db.create_all()
        print("      Schema verified.")

        # Seed data
        print("\n[3/4] Seeding departments & academic catalogue...")
        seed_departments()
        seed_academic_data()

        print("\n[4/4] Provisioning administrator account...")
        admin_ok = seed_admin()

        if admin_ok:
            print("\n============================================================")
            print(" SUCCESS: Database initialization completed successfully!")
            print("============================================================\n")
        else:
            print("\n============================================================")
            print(" WARNING: Initialization completed with errors (Admin was not provisioned).")
            print("============================================================\n")
            sys.exit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Safely initialize admin and catalogue data.")
    parser.add_argument('--require-postgres', action='store_true', help="Refuse to run unless dialect is PostgreSQL.")
    parser.add_argument('-y', '--yes', action='store_true', help="Skip interactive confirmation prompt.")
    args = parser.parse_args()

    run_initialization(require_postgres=args.require_postgres, auto_confirm=args.yes)
