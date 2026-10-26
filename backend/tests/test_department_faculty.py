"""
Tests for Department-Wise Approved Faculty Management System
Covers:
- Registration with ERP ID and mandatory department selection
- Validation (missing ERP ID, missing department, duplicate ERP ID)
- Admin department listing and department reassignment
- Admin faculty status update
- Access control (non-admin cannot reassign department or approve)
"""

import pytest
from flask_jwt_extended import create_access_token
from app.models import User, ApprovedTeacherEmail, TeacherProfile, Department, TeacherAssignment


class TestDepartmentWiseFacultySystem:

    def test_department_listing(self, client, admin_token):
        """Admin can list the 9 official departments."""
        res = client.get('/api/admin/departments', headers={'Authorization': f'Bearer {admin_token}'})
        assert res.status_code == 200
        data = res.get_json()
        depts = [d['name'] for d in data['departments']]
        assert 'Artificial Intelligence & Data Science' in depts
        assert 'Computer Engineering' in depts
        assert 'Information Technology' in depts
        assert 'First Year Department' in depts
        assert len(depts) == 9

    def test_registration_with_erp_id_and_department(self, client, database):
        """Teacher can register with ERP ID and select a department."""
        # 1. Add allowlist email
        approved = ApprovedTeacherEmail(email='new.faculty@dypvp.edu.in', is_used=False)
        database.session.add(approved)
        database.session.commit()

        # 2. Token
        token = create_access_token(
            identity='new.faculty@dypvp.edu.in',
            additional_claims={
                'purpose': 'TEACHER_REGISTRATION',
                'verified_email': 'new.faculty@dypvp.edu.in',
                'type': 'EMAIL_VERIFICATION',
            }
        )

        # 3. Register
        res = client.post(
            '/api/auth/register/teacher',
            json={
                'full_name': 'Dr. Anita Desai',
                'department': 'Artificial Intelligence & Data Science',
                'designation': 'Associate Professor',
                'erp_id': 'ERP-AI-901',
                'teaching_assignments': [
                    {
                        'academicYear': 'TE — 3rd Year',
                        'subject': 'Database Management Systems (DBMS)',
                        'divisions': ['A']
                    }
                ]
            },
            headers={'Authorization': f'Bearer {token}'}
        )
        assert res.status_code == 201

        # Verify saved correctly
        user = User.query.filter_by(email='new.faculty@dypvp.edu.in').first()
        assert user is not None
        assert user.status == 'PENDING'
        assert user.profile.erp_id == 'ERP-AI-901'
        assert user.profile.department == 'Artificial Intelligence & Data Science'
        assert user.profile.department_id is not None

    def test_registration_fails_missing_fields(self, client, database):
        """Registration fails if ERP ID or department is missing."""
        approved = ApprovedTeacherEmail(email='missing@dypvp.edu.in', is_used=False)
        database.session.add(approved)
        database.session.commit()

        token = create_access_token(
            identity='missing@dypvp.edu.in',
            additional_claims={
                'purpose': 'TEACHER_REGISTRATION',
                'verified_email': 'missing@dypvp.edu.in',
                'type': 'EMAIL_VERIFICATION',
            }
        )

        # Missing erp_id
        res = client.post(
            '/api/auth/register/teacher',
            json={
                'full_name': 'Test Faculty',
                'department': 'Computer Engineering',
                'designation': 'Lecturer',
                'erp_id': '',
            },
            headers={'Authorization': f'Bearer {token}'}
        )
        assert res.status_code == 400

        # Invalid department
        res2 = client.post(
            '/api/auth/register/teacher',
            json={
                'full_name': 'Test Faculty',
                'department': 'NonExistent Department XYZ',
                'designation': 'Lecturer',
                'erp_id': 'ERP-101',
            },
            headers={'Authorization': f'Bearer {token}'}
        )
        assert res2.status_code == 400

    def test_duplicate_erp_id_rejected(self, client, database):
        """Duplicate ERP IDs are rejected with 409."""
        # Create existing user with ERP-DUPLICATE
        existing = User(email='existing@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add(existing)
        database.session.flush()
        profile = TeacherProfile(
            user_id=existing.id,
            full_name='Existing Faculty',
            department='Computer Engineering',
            designation='Professor',
            staff_id='ERP-DUPLICATE'
        )
        database.session.add(profile)

        # Allowlist new user
        approved = ApprovedTeacherEmail(email='dup@dypvp.edu.in', is_used=False)
        database.session.add(approved)
        database.session.commit()

        token = create_access_token(
            identity='dup@dypvp.edu.in',
            additional_claims={
                'purpose': 'TEACHER_REGISTRATION',
                'verified_email': 'dup@dypvp.edu.in',
                'type': 'EMAIL_VERIFICATION',
            }
        )

        res = client.post(
            '/api/auth/register/teacher',
            json={
                'full_name': 'New Applicant',
                'department': 'Computer Engineering',
                'designation': 'Assistant Professor',
                'erp_id': 'ERP-DUPLICATE',
            },
            headers={'Authorization': f'Bearer {token}'}
        )
        assert res.status_code == 409
        assert 'ERP ID already in use' in res.get_json()['error']

    def test_admin_reassign_department(self, client, admin_token, database):
        """Admin can reassign faculty department and updates are reflected immediately."""
        user = User(email='faculty.move@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add(user)
        database.session.flush()

        profile = TeacherProfile(
            user_id=user.id,
            full_name='Prof Moved',
            department='Civil Engineering',
            designation='Assistant Professor',
            staff_id='ERP-CIVIL-1'
        )
        database.session.add(profile)
        database.session.commit()

        # Admin reassigns to Mechanical Engineering
        res = client.patch(
            f'/api/admin/faculty/{user.id}/department',
            json={'department': 'Mechanical Engineering'},
            headers={'Authorization': f'Bearer {admin_token}'}
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data['teacher']['profile']['department'] == 'Mechanical Engineering'

        # Verify in DB
        reloaded = database.session.get(TeacherProfile, profile.id)
        assert reloaded.department == 'Mechanical Engineering'

    def test_unauthorized_department_reassign_rejected(self, client, database):
        """Non-admin cannot reassign faculty department."""
        user = User(email='victim@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add(user)
        database.session.flush()
        profile = TeacherProfile(
            user_id=user.id,
            full_name='Prof Target',
            department='Civil Engineering',
            designation='Assistant Professor',
            staff_id='ERP-VICTIM-1'
        )
        database.session.add(profile)
        database.session.commit()

        # Regular teacher token
        teacher_token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': 'TEACHER', 'email': user.email}
        )

        res = client.patch(
            f'/api/admin/faculty/{user.id}/department',
            json={'department': 'Mechanical Engineering'},
            headers={'Authorization': f'Bearer {teacher_token}'}
        )
        assert res.status_code == 403

    def test_admin_update_status(self, client, admin_token, database):
        """Admin can deactivate or update status without deleting records."""
        user = User(email='deactivate@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add(user)
        database.session.flush()
        profile = TeacherProfile(
            user_id=user.id,
            full_name='Prof Deact',
            department='Instrumentation Engineering',
            designation='Assistant Professor',
            staff_id='ERP-INST-1'
        )
        database.session.add(profile)
        database.session.commit()

        # Suspend faculty
        res = client.patch(
            f'/api/admin/faculty/{user.id}/status',
            json={'status': 'SUSPENDED'},
            headers={'Authorization': f'Bearer {admin_token}'}
        )
        assert res.status_code == 200
        assert database.session.get(User, user.id).status == 'SUSPENDED'
