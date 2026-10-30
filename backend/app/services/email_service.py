"""
Email Service — Resend HTTPS API for OTP delivery and notifications.
"""

from typing import Optional
from flask import current_app
import resend
from resend.exceptions import ResendError


class EmailService:
    """Send transactional emails using Resend HTTPS API."""

    DEFAULT_FROM = "QR Attendance System <onboarding@resend.dev>"

    @classmethod
    def _send_email(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Internal helper to send an email via Resend's HTTPS API.
        Returns True on success, False on failure.
        Never logs sensitive content (OTPs, login codes, API keys).
        """
        api_key = current_app.config.get('RESEND_API_KEY')
        if not api_key:
            current_app.logger.error("Email delivery failed: RESEND_API_KEY is not configured.")
            return False

        email_from = current_app.config.get('EMAIL_FROM') or cls.DEFAULT_FROM
        resend.api_key = api_key

        params = {
            "from": email_from,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        if text_content:
            params["text"] = text_content

        try:
            response = resend.Emails.send(params)
            email_id = getattr(response, 'id', None) or (response.get('id') if isinstance(response, dict) else None)
            if email_id:
                current_app.logger.info(f"Email successfully accepted by Resend for {to_email} (ID: {email_id})")
                return True

            current_app.logger.error(f"Resend API did not return a valid message ID for recipient {to_email}")
            return False

        except ResendError as e:
            current_app.logger.error(f"Resend API error sending email to {to_email}: {type(e).__name__} - {str(e)}")
            return False
        except Exception as e:
            current_app.logger.error(f"Unexpected error sending email to {to_email}: {type(e).__name__}")
            return False

    @classmethod
    def send_otp_email(cls, to_email: str, otp: str, purpose: str) -> bool:
        """
        Send OTP verification email via Resend HTTPS API.
        Returns True on success, False on failure.
        Never logs the OTP value.
        """
        purpose_label = {
            'TEACHER_REGISTRATION': 'Teacher Registration',
            'LOGIN_CODE_RECOVERY': 'Login Code Recovery',
        }.get(purpose, 'Verification')

        subject = f'QR Attendance System — {purpose_label} OTP'
        html_content = f"""
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
                    <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">{purpose_label}</h2>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                    Your one-time verification code is:
                </p>
                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block; background: #8B1E2B; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; border-radius: 8px;">
                        {otp}
                    </span>
                </div>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                    This code expires in <strong>5 minutes</strong>. Do not share it with anyone.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #999; font-size: 11px; text-align: center;">
                    If you did not request this code, please ignore this email.
                </p>
            </div>
        </body>
        </html>
        """
        text_content = f'Your {purpose_label} OTP is: {otp}. It expires in 5 minutes.'

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @classmethod
    def send_login_code_email(cls, to_email: str, login_code: str) -> bool:
        """Send the generated login code to the teacher after registration/recovery via Resend."""
        subject = 'QR Attendance System — Your Login Code'
        html_content = f"""
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
                    <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">Your Login Code</h2>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                    Your secure login code has been generated:
                </p>
                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block; background: #8B1E2B; color: white; font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 16px 32px; border-radius: 8px; word-break: break-all;">
                        {login_code}
                    </span>
                </div>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                    <strong>Important:</strong> Save this code securely. You will need it to log in.
                    This code cannot be recovered — if you lose it, you will need to use the "Forgot Login Code" feature.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #999; font-size: 11px; text-align: center;">
                    Do not share this code with anyone.
                </p>
            </div>
        </body>
        </html>
        """
        text_content = f'Your login code is: {login_code}. Save this securely.'

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @classmethod
    def send_code_changed_notification(cls, to_email: str) -> bool:
        """Notify teacher via Resend that their login code was changed."""
        subject = 'QR Attendance System — Login Code Changed'
        html_content = """
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
                    <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">Login Code Changed</h2>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                    Your login code for the QR Attendance System has been successfully changed.
                </p>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                    If you did not make this change, please contact your administrator immediately.
                </p>
            </div>
        </body>
        </html>
        """
        text_content = 'Your login code has been changed. Contact admin if this was not you.'

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @classmethod
    def send_approval_email(cls, to_email: str) -> bool:
        """Send account approval confirmation to faculty via Resend."""
        subject = 'QR Attendance System — Faculty Account Approved'
        html_content = """
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
                    <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">Account Approved</h2>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                    Congratulations! Your faculty account has been reviewed and approved by the administrator.
                </p>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                    You may now sign in using your registered email and personal login code to start taking attendance.
                </p>
            </div>
        </body>
        </html>
        """
        text_content = 'Your faculty account has been approved. You can now sign in using your login code.'

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )
