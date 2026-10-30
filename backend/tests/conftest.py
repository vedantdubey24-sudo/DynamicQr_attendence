"""
Pytest Configuration and Test Fixtures
"""

import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from werkzeug.security import generate_password_hash
from app import create_app, db as _db
from app.models import (
    User, ApprovedTeacherEmail, TeacherProfile,
    LoginCodeCredential, AcademicYear, Class, Division, Subject,
    TeacherAssignment
)


@pytest.fixture(scope='session')
def app():
    """Create application for testing."""
    test_db_url = os.getenv('TEST_DATABASE_URL', 'sqlite:///:memory:')
    test_config = {
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': test_db_url,
        'SQLALCHEMY_SESSION_OPTIONS': {'expire_on_commit': False},
        'JWT_SECRET_KEY': 'test-jwt-secret-with-at-least-32-bytes-length',
        'OTP_HMAC_SECRET': 'test-hmac-secret-with-at-least-32-bytes-length',
        'RESEND_API_KEY': 're_test_mock_api_key_123',
        'EMAIL_FROM': 'QR Attendance System <onboarding@resend.dev>',
        'GMAIL_ADDRESS': 'test@test.com',
        'GMAIL_APP_PASSWORD': 'test-password',
        'FRONTEND_URL': 'http://localhost:5173',
    }
    app = create_app(test_config)
    return app


@pytest.fixture(scope='session')
def database(app):
    """Set up the test database."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.drop_all()


@pytest.fixture(autouse=True)
def clean_db(app, database):
    """Ensure clean database state and active app context for each test."""
    ctx = app.app_context()
    ctx.push()
    yield
    database.session.rollback()
    for table in reversed(database.metadata.sorted_tables):
        database.session.execute(table.delete())
    database.session.commit()
    ctx.pop()


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture
def admin_user(database):
    """Create an admin user."""
    admin = User(
        email='admin@test.edu',
        role='ADMIN',
        password_hash=generate_password_hash('admin123'),
        status='APPROVED',
    )
    database.session.add(admin)
    database.session.commit()
    return admin


@pytest.fixture
def admin_token(client, admin_user):
    """Get an admin JWT token."""
    response = client.post('/api/admin/login', json={
        'email': 'admin@test.edu',
        'password': 'admin123',
    })
    return response.json['access_token']


@pytest.fixture
def approved_email(database, admin_user):
    """Create an approved teacher email."""
    entry = ApprovedTeacherEmail(
        email='teacher@test.edu',
        is_used=False,
        created_by=admin_user.id,
    )
    database.session.add(entry)
    database.session.commit()
    return entry


@pytest.fixture
def academic_data(database):
    """Create academic data for testing."""
    year = AcademicYear(year_name='2025-2026', is_active=True)
    database.session.add(year)
    database.session.flush()

    cls = Class(class_name='FY BSc CS', academic_year_id=year.id)
    database.session.add(cls)
    database.session.flush()

    div = Division(division_name='A', class_id=cls.id)
    database.session.add(div)
    database.session.flush()

    subj = Subject(subject_name='Data Structures', subject_code='CS201')
    database.session.add(subj)
    database.session.flush()

    database.session.commit()
    return {'year': year, 'class': cls, 'division': div, 'subject': subj}


@pytest.fixture
def teacher_user(database, approved_email, academic_data):
    """Create an approved teacher with assignments."""
    user = User(
        email='teacher@test.edu',
        role='TEACHER',
        status='APPROVED',
    )
    database.session.add(user)
    database.session.flush()

    profile = TeacherProfile(
        user_id=user.id,
        full_name='Test Teacher',
        department='Computer Science',
        designation='Assistant Professor',
        staff_id='STAFF001',
    )
    database.session.add(profile)

    code_hash = generate_password_hash('test-login-code')
    credential = LoginCodeCredential(
        user_id=user.id,
        code_hash=code_hash,
        is_revoked=False,
    )
    database.session.add(credential)

    assignment = TeacherAssignment(
        teacher_id=user.id,
        class_id=academic_data['class'].id,
        division_id=academic_data['division'].id,
        subject_id=academic_data['subject'].id,
    )
    database.session.add(assignment)

    approved_email.is_used = True
    database.session.commit()
    return user


@pytest.fixture
def teacher_token(client, teacher_user):
    """Get a teacher JWT token."""
    response = client.post('/api/auth/login/code', json={
        'email': 'teacher@test.edu',
        'code': 'test-login-code',
    })
    return response.json['access_token']
