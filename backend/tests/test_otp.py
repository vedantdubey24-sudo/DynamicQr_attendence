from unittest.mock import patch

from app.models import OTPChallenge
from app.services.email_service import EmailService


def test_registration_otp_can_be_verified(client, approved_email):
    sent_otp = {}

    def capture_otp(email, otp, purpose):
        sent_otp['otp'] = otp
        return True

    with patch.object(EmailService, 'send_otp_email', side_effect=capture_otp):
        send_response = client.post('/api/auth/send-otp', json={
            'email': approved_email.email,
            'purpose': 'TEACHER_REGISTRATION',
        })
        verify_response = client.post('/api/auth/verify-otp', json={
            'email': approved_email.email,
            'otp': sent_otp['otp'],
            'purpose': 'TEACHER_REGISTRATION',
        })

    assert send_response.status_code == 200
    assert verify_response.status_code == 200
    assert 'verification_token' in verify_response.json


def test_registration_otp_rejects_non_six_digit_input(client, approved_email):
    response = client.post('/api/auth/verify-otp', json={
        'email': approved_email.email,
        'otp': '12345',
        'purpose': 'TEACHER_REGISTRATION',
    })

    assert response.status_code == 400
    assert response.json['error'] == 'OTP must contain exactly 6 digits.'


def test_registration_email_failure_does_not_leave_otp_challenge(client, approved_email):
    with patch.object(EmailService, 'send_otp_email', return_value=False):
        response = client.post('/api/auth/send-otp', json={
            'email': approved_email.email,
            'purpose': 'TEACHER_REGISTRATION',
        })

    assert response.status_code == 500
    assert OTPChallenge.query.count() == 0


def test_recovery_email_failure_is_reported_and_rolls_back_challenge(client, teacher_user):
    with patch.object(EmailService, 'send_otp_email', return_value=False):
        response = client.post('/api/auth/recovery/send-otp', json={
            'email': teacher_user.email,
        })

    assert response.status_code == 500
    assert OTPChallenge.query.count() == 0


def test_recovery_otp_can_be_verified(client, teacher_user):
    sent_otp = {}

    def capture_otp(email, otp, purpose):
        sent_otp['otp'] = otp
        return True

    with patch.object(EmailService, 'send_otp_email', side_effect=capture_otp):
        send_response = client.post('/api/auth/recovery/send-otp', json={
            'email': teacher_user.email,
        })
        verify_response = client.post('/api/auth/recovery/verify-otp', json={
            'email': teacher_user.email,
            'otp': sent_otp['otp'],
        })

    assert send_response.status_code == 200
    assert verify_response.status_code == 200
    assert 'recovery_token' in verify_response.json
