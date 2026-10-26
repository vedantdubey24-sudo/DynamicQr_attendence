import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from app.models import (
    User, TeacherProfile, ApprovedTeacherEmail, TeacherAssignment,
    Class, Division, Subject, AcademicYear
)
from app.constants import COURSE_CATALOGUE, DEPARTMENTS, DESIGNATIONS


class TestFacultyModifications:
    """Tests for Tasks 2, 4, 5, 6 - Faculty self-registration of courses, profile editing, and admin approval."""

    def test_teacher_registration_with_course_assignments(self, client, database):
        # 1. Add approved email
        approved = ApprovedTeacherEmail(
            email='priya.metri@dypvp.edu.in',
            is_used=False
        )
        database.session.add(approved)
        database.session.commit()

        # 2. Get verification token (simulate OTP step 2)
        from flask_jwt_extended import create_access_token
        from datetime import timedelta
        token = create_access_token(
            identity='priya.metri@dypvp.edu.in',
            additional_claims={
                'purpose': 'TEACHER_REGISTRATION',
                'verified_email': 'priya.metri@dypvp.edu.in',
                'type': 'EMAIL_VERIFICATION',
            },
            expires_delta=timedelta(minutes=15)
        )

        # 3. Register teacher with teaching assignments
        payload = {
            'full_name': 'Prof Priya Metri',
            'department': 'Artificial Intelligence & Data Science',
            'designation': 'Assistant Professor',
            'staff_id': 'FAC-205',
            'teaching_assignments': [
                {
                    'academicYear': 'TE — 3rd Year',
                    'subject': 'Database Management Systems (DBMS)',
                    'divisions': ['A', 'B']
                },
                {
                    'academicYear': 'SE — 2nd Year',
                    'subject': 'Data Structures & Algorithms',
                    'divisions': ['C']
                }
            ]
        }

        res = client.post(
            '/api/auth/register/teacher',
            json=payload,
            headers={'Authorization': f'Bearer {token}'}
        )

        assert res.status_code == 201
        data = res.get_json()
        assert 'login_code' in data
        assert data['user']['status'] == 'PENDING'

        # Check DB assignments
        user = User.query.filter_by(email='priya.metri@dypvp.edu.in').first()
        assert user is not None
        assert user.profile.staff_id == 'FAC-205'
        assert user.profile.department == 'Artificial Intelligence & Data Science'

        assignments = TeacherAssignment.query.filter_by(teacher_id=user.id).all()
        # TE DBMS Div A, Div B + SE DSA Div C = 3 rows
        assert len(assignments) == 3

    def test_admin_approve_and_reject_faculty(self, client, database, admin_token):
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # Create a pending teacher
        teacher_user = User(
            email='applicant@dypvp.edu.in',
            role='TEACHER',
            status='PENDING'
        )
        database.session.add(teacher_user)
        database.session.flush()

        profile = TeacherProfile(
            user_id=teacher_user.id,
            full_name='Dr. Rajesh Sharma',
            department='Computer Engineering',
            designation='Associate Professor',
            staff_id='FAC-CS-204'
        )
        database.session.add(profile)
        database.session.commit()

        # Admin approves faculty via PATCH /api/admin/faculty/<id>/approve
        res = client.patch(
            f'/api/admin/faculty/{teacher_user.id}/approve',
            headers=admin_headers
        )
        assert res.status_code == 200
        assert res.get_json()['message'] == 'Teacher approved successfully'

        database.session.refresh(teacher_user)
        assert teacher_user.status == 'APPROVED'

        # Create another pending teacher to test rejection
        teacher_user_2 = User(
            email='reject.me@dypvp.edu.in',
            role='TEACHER',
            status='PENDING'
        )
        database.session.add(teacher_user_2)
        database.session.flush()

        res_reject = client.patch(
            f'/api/admin/faculty/{teacher_user_2.id}/reject',
            headers=admin_headers
        )
        assert res_reject.status_code == 200
        database.session.refresh(teacher_user_2)
        assert teacher_user_2.status == 'REJECTED'

    def test_teacher_profile_get_and_put(self, client, database):
        # Create active teacher
        user = User(email='faculty.update@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add(user)
        database.session.flush()

        profile = TeacherProfile(
            user_id=user.id,
            full_name='Prof Priya Metri',
            department='Computer Engineering',
            designation='Assistant Professor',
            staff_id='FAC-999'
        )
        database.session.add(profile)
        database.session.commit()

        from flask_jwt_extended import create_access_token
        teacher_token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': 'TEACHER', 'email': user.email}
        )
        headers = {'Authorization': f'Bearer {teacher_token}'}

        # 1. GET /api/teacher/profile
        res = client.get('/api/teacher/profile', headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data['email'] == 'faculty.update@dypvp.edu.in'
        assert data['staff_id'] == 'FAC-999'
        assert 'teaching_assignments' in data

        # 2. PUT /api/teacher/profile (update department & assignments)
        update_payload = {
            'department': 'Artificial Intelligence & Data Science',
            'designation': 'Associate Professor',
            'teaching_assignments': [
                {
                    'academicYear': 'BE — 4th Year',
                    'subject': 'Machine Learning',
                    'divisions': ['A', 'B', 'C']
                }
            ]
        }

        res_put = client.put('/api/teacher/profile', json=update_payload, headers=headers)
        assert res_put.status_code == 200
        put_data = res_put.get_json()
        assert put_data['profile']['department'] == 'Artificial Intelligence & Data Science'
        assert put_data['profile']['designation'] == 'Associate Professor'

        # Check DB assignments updated
        assignments = TeacherAssignment.query.filter_by(teacher_id=user.id).all()
        # BE ML Div A, B, C = 3 rows
        assert len(assignments) == 3

        # Verify locked fields (email, staff_id) were NOT modified if client sent them
        hack_payload = {
            'email': 'hacked@example.com',
            'staff_id': 'HACKED-001',
            'department': 'Civil Engineering',
            'designation': 'Professor'
        }
        res_hack = client.put('/api/teacher/profile', json=hack_payload, headers=headers)
        assert res_hack.status_code == 200
        database.session.refresh(user)
        database.session.refresh(user.profile)
        assert user.email == 'faculty.update@dypvp.edu.in'
        assert user.profile.staff_id == 'FAC-999'
        assert user.profile.department == 'Civil Engineering'

    def test_admin_can_delete_used_and_unused_approved_email(self, client, database, admin_token):
        admin_headers = {'Authorization': f'Bearer {admin_token}'}

        # 1. Add approved email that is unused
        email_unused = ApprovedTeacherEmail(email='unused.faculty@dypvp.edu.in', is_used=False)
        database.session.add(email_unused)
        database.session.commit()

        # Delete unused
        res_del1 = client.delete(f'/api/admin/approved-teacher-emails/{email_unused.id}', headers=admin_headers)
        assert res_del1.status_code == 200
        assert ApprovedTeacherEmail.query.filter_by(email='unused.faculty@dypvp.edu.in').first() is None

        # 2. Add approved email that IS registered/used
        email_used = ApprovedTeacherEmail(email='registered.faculty@dypvp.edu.in', is_used=True)
        faculty_user = User(email='registered.faculty@dypvp.edu.in', role='TEACHER', status='APPROVED')
        database.session.add_all([email_used, faculty_user])
        database.session.commit()

        profile = TeacherProfile(
            user_id=faculty_user.id,
            full_name='Dr Registered',
            department='Computer Engineering',
            designation='Professor',
            staff_id='STAFF-DEL-1',
        )
        database.session.add(profile)
        database.session.commit()

        # Admin deletes this registered email
        res_del2 = client.delete(f'/api/admin/approved-teacher-emails/{email_used.id}', headers=admin_headers)
        assert res_del2.status_code == 200

        # Verify allowlist entry, user, and profile are all deleted
        assert ApprovedTeacherEmail.query.filter_by(email='registered.faculty@dypvp.edu.in').first() is None
        assert User.query.filter_by(email='registered.faculty@dypvp.edu.in').first() is None
        assert TeacherProfile.query.filter_by(staff_id='STAFF-DEL-1').first() is None
