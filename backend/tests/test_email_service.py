"""
Tests for Resend Email Service Integration.
"""

from unittest.mock import patch, MagicMock
import pytest
from resend.exceptions import ResendError

from app.services.email_service import EmailService


def test_send_otp_email_success(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {'id': 'resend_email_id_123'}

            result = EmailService.send_otp_email(
                to_email='faculty@institution.edu',
                otp='654321',
                purpose='TEACHER_REGISTRATION'
            )

            assert result is True
            assert mock_send.call_count == 1
            call_args = mock_send.call_args[0][0]
            assert call_args['to'] == ['faculty@institution.edu']
            assert 'Teacher Registration' in call_args['subject']
            assert '654321' in call_args['html']
            assert '654321' in call_args['text']


def test_send_otp_email_recovery_purpose(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {'id': 'resend_email_id_456'}

            result = EmailService.send_otp_email(
                to_email='faculty@institution.edu',
                otp='112233',
                purpose='LOGIN_CODE_RECOVERY'
            )

            assert result is True
            call_args = mock_send.call_args[0][0]
            assert 'Login Code Recovery' in call_args['subject']
            assert '112233' in call_args['html']


def test_send_otp_email_missing_api_key(app):
    with app.app_context():
        with patch.dict(app.config, {'RESEND_API_KEY': ''}):
            with patch('resend.Emails.send') as mock_send:
                result = EmailService.send_otp_email(
                    to_email='faculty@institution.edu',
                    otp='654321',
                    purpose='TEACHER_REGISTRATION'
                )

                assert result is False
                assert mock_send.call_count == 0


def test_send_email_resend_error_handled(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.side_effect = ResendError(401, 'invalid_api_key', 'Invalid API key', 'Check API key')

            result = EmailService.send_otp_email(
                to_email='faculty@institution.edu',
                otp='654321',
                purpose='TEACHER_REGISTRATION'
            )

            assert result is False


def test_send_email_unexpected_exception_handled(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.side_effect = ConnectionError('Network unreachable')

            result = EmailService.send_otp_email(
                to_email='faculty@institution.edu',
                otp='654321',
                purpose='TEACHER_REGISTRATION'
            )

            assert result is False


def test_send_email_missing_id_in_response(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {}

            result = EmailService.send_otp_email(
                to_email='faculty@institution.edu',
                otp='654321',
                purpose='TEACHER_REGISTRATION'
            )

            assert result is False


def test_send_login_code_email(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {'id': 'resend_login_code_123'}

            result = EmailService.send_login_code_email(
                to_email='faculty@institution.edu',
                login_code='A9B8C7'
            )

            assert result is True
            call_args = mock_send.call_args[0][0]
            assert call_args['to'] == ['faculty@institution.edu']
            assert 'Your Login Code' in call_args['subject']
            assert 'A9B8C7' in call_args['html']
            assert 'A9B8C7' in call_args['text']


def test_send_code_changed_notification(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {'id': 'resend_code_changed_123'}

            result = EmailService.send_code_changed_notification(
                to_email='faculty@institution.edu'
            )

            assert result is True
            call_args = mock_send.call_args[0][0]
            assert call_args['to'] == ['faculty@institution.edu']
            assert 'Login Code Changed' in call_args['subject']


def test_send_approval_email(app):
    with app.app_context():
        with patch('resend.Emails.send') as mock_send:
            mock_send.return_value = {'id': 'resend_approval_123'}

            result = EmailService.send_approval_email(
                to_email='faculty@institution.edu'
            )

            assert result is True
            call_args = mock_send.call_args[0][0]
            assert call_args['to'] == ['faculty@institution.edu']
            assert 'Faculty Account Approved' in call_args['subject']


def test_send_via_smtp_success(app):
    with app.app_context():
        with patch('smtplib.SMTP') as mock_smtp:
            instance = mock_smtp.return_value.__enter__.return_value
            result = EmailService._send_via_smtp(
                to_email='faculty@institution.edu',
                subject='Test Subject',
                html_content='<p>Test HTML</p>',
                text_content='Test Text'
            )
            assert result is True
            assert instance.starttls.called
            assert instance.login.called
            assert instance.sendmail.called


def test_send_via_smtp_missing_credentials(app):
    with app.app_context():
        with patch.dict(app.config, {'GMAIL_ADDRESS': '', 'GMAIL_APP_PASSWORD': ''}):
            result = EmailService._send_via_smtp(
                to_email='faculty@institution.edu',
                subject='Test Subject',
                html_content='<p>Test HTML</p>'
            )
            assert result is False
