"""
Tests for Allowlist, Registration, and Auth
"""

import pytest


class TestAllowlistAndRegistration:
    """Test approved email allowlist and registration flow."""

    def test_approved_email_can_be_added(self, client, admin_token):
        """Admin can add approved emails."""
        response = client.post(
            '/api/admin/approved-teacher-emails',
            json={'email': 'new.teacher@test.edu'},
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert response.status_code == 201
        assert response.json['entry']['email'] == 'new.teacher@test.edu'

    def test_duplicate_email_rejected(self, client, admin_token, approved_email):
        """Duplicate approved email is rejected."""
        response = client.post(
            '/api/admin/approved-teacher-emails',
            json={'email': 'teacher@test.edu'},
            headers={'Authorization': f'Bearer {admin_token}'},
        )
        assert response.status_code == 409

    def test_unapproved_email_cannot_check(self, client):
        """Unapproved email is rejected before OTP."""
        response = client.post('/api/auth/teacher/check-email', json={
            'email': 'unapproved@test.edu',
        })
        assert response.status_code == 403

    def test_approved_email_can_check(self, client, approved_email):
        """Approved email passes check."""
        response = client.post('/api/auth/teacher/check-email', json={
            'email': 'teacher@test.edu',
        })
        assert response.status_code == 200

    def test_used_email_cannot_register(self, client, teacher_user):
        """Used email cannot register again."""
        response = client.post('/api/auth/teacher/check-email', json={
            'email': 'teacher@test.edu',
        })
        assert response.status_code == 409


class TestTeacherLogin:
    """Test teacher login flow."""

    def test_pending_teacher_cannot_login(self, client, app, database, approved_email):
        """Pending teacher cannot login."""
        from werkzeug.security import generate_password_hash
        from app.models import User, TeacherProfile, LoginCodeCredential

        with app.app_context():
            user = User(email='pending@test.edu', role='TEACHER', status='PENDING')
            database.session.add(user)
            database.session.flush()

            # Need an approved email for this pending teacher
            from app.models import ApprovedTeacherEmail
            ae = ApprovedTeacherEmail(email='pending@test.edu', is_used=True)
            database.session.add(ae)

            profile = TeacherProfile(
                user_id=user.id, full_name='Pending', department='CS',
                designation='Lecturer', staff_id='PEND001'
            )
            database.session.add(profile)
            cred = LoginCodeCredential(
                user_id=user.id, code_hash=generate_password_hash('pending-code'),
                is_revoked=False
            )
            database.session.add(cred)
            database.session.commit()

        response = client.post('/api/auth/login/code', json={
            'email': 'pending@test.edu',
            'code': 'pending-code',
        })
        assert response.status_code == 403
        assert 'pending' in response.json['error'].lower()

    def test_approved_teacher_can_login(self, client, teacher_user):
        """Approved teacher can login with correct code."""
        response = client.post('/api/auth/login/code', json={
            'email': 'teacher@test.edu',
            'code': 'test-login-code',
        })
        assert response.status_code == 200
        assert 'access_token' in response.json

    def test_wrong_code_rejected(self, client, teacher_user):
        """Invalid login code is rejected."""
        response = client.post('/api/auth/login/code', json={
            'email': 'teacher@test.edu',
            'code': 'wrong-code',
        })
        assert response.status_code == 401


class TestQRSessions:
    """Test attendance session and QR token generation."""

    def test_teacher_can_create_session(self, client, teacher_token, academic_data):
        """Authorized teacher can start a session."""
        response = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': academic_data['class'].id,
                'division_id': academic_data['division'].id,
                'subject_id': academic_data['subject'].id,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 201
        assert response.json['session']['status'] == 'ACTIVE'
        assert response.json['qr'] is not None

    def test_unassigned_class_rejected(self, client, teacher_token):
        """Teacher cannot create session for unassigned class."""
        response = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': 999,
                'division_id': 999,
                'subject_id': 999,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 403

    def test_session_returns_qr_token(self, client, teacher_token, academic_data):
        """Session creation returns a QR token."""
        response = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': academic_data['class'].id,
                'division_id': academic_data['division'].id,
                'subject_id': academic_data['subject'].id,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 201
        qr = response.json['qr']
        assert 'token' in qr
        assert 'remaining_seconds' in qr
        assert qr['remaining_seconds'] <= 90

    def test_can_get_current_qr(self, client, teacher_token, academic_data):
        """Can fetch current QR token for active session."""
        # Create session
        create_resp = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': academic_data['class'].id,
                'division_id': academic_data['division'].id,
                'subject_id': academic_data['subject'].id,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        session_id = create_resp.json['session']['id']

        # Get current QR
        response = client.get(
            f'/api/attendance/sessions/{session_id}/current-qr',
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 200
        assert 'qr' in response.json

    def test_can_close_session(self, client, teacher_token, academic_data):
        """Teacher can close an active session."""
        # Create session
        create_resp = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': academic_data['class'].id,
                'division_id': academic_data['division'].id,
                'subject_id': academic_data['subject'].id,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        session_id = create_resp.json['session']['id']

        # Close session
        response = client.post(
            f'/api/attendance/sessions/{session_id}/close',
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 200
        assert response.json['session']['status'] == 'CLOSED'

    def test_closed_session_no_new_qr(self, client, teacher_token, academic_data):
        """Closed session does not issue new QR tokens."""
        # Create and close session
        create_resp = client.post(
            '/api/attendance/sessions',
            json={
                'class_id': academic_data['class'].id,
                'division_id': academic_data['division'].id,
                'subject_id': academic_data['subject'].id,
            },
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        session_id = create_resp.json['session']['id']

        client.post(
            f'/api/attendance/sessions/{session_id}/close',
            headers={'Authorization': f'Bearer {teacher_token}'},
        )

        # Try to get QR
        response = client.get(
            f'/api/attendance/sessions/{session_id}/current-qr',
            headers={'Authorization': f'Bearer {teacher_token}'},
        )
        assert response.status_code == 410
