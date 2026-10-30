"""
Email Service — Resend HTTPS API & Gmail SMTP for OTP delivery and notifications.
"""

from typing import Optional
from flask import current_app
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import resend
from resend.exceptions import ResendError


class EmailService:
    """Send transactional emails using Resend HTTPS API with SMTP fallback."""

    DEFAULT_FROM = "QR Attendance System <onboarding@resend.dev>"

    @classmethod
    def _send_via_smtp(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email via configured SMTP (e.g. Gmail).
        Returns True on success, False on failure.
        """
        gmail_address = current_app.config.get('GMAIL_ADDRESS')
        gmail_password = current_app.config.get('GMAIL_APP_PASSWORD')
        smtp_host = current_app.config.get('SMTP_HOST', 'smtp.gmail.com')
        smtp_port = current_app.config.get('SMTP_PORT', 587)

        if not (gmail_address and gmail_password):
            current_app.logger.warning("SMTP delivery skipped: GMAIL_ADDRESS or GMAIL_APP_PASSWORD not configured.")
            return False

        try:
            cleaned_pwd = str(gmail_password).replace(' ', '').strip()

            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"QR Attendance System <{gmail_address}>"
            msg['To'] = to_email

            if text_content:
                msg.attach(MIMEText(text_content, 'plain'))
            if html_content:
                msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(smtp_host, int(smtp_port), timeout=10) as server:
                server.starttls()
                server.login(gmail_address, cleaned_pwd)
                server.sendmail(gmail_address, [to_email], msg.as_string())

            current_app.logger.info(f"Email successfully sent via SMTP to {to_email}")
            return True
        except Exception as e:
            current_app.logger.error(f"SMTP error sending email to {to_email}: {type(e).__name__} - {str(e)}")
            return False

    
    @classmethod
    def _send_email(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send through Resend when configured.
        SMTP is used only when Resend is not configured,
        such as during local development.
        """
        api_key = current_app.config.get('RESEND_API_KEY')

        # Production: use Resend HTTPS API
        if api_key:
            email_from = (
                current_app.config.get('EMAIL_FROM')
                or cls.DEFAULT_FROM
            )

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

                email_id = (
                    getattr(response, 'id', None)
                    or (
                        response.get('id')
                        if isinstance(response, dict)
                        else None
                    )
                )

                if email_id:
                    current_app.logger.info(
                        f"Email accepted by Resend. ID: {email_id}"
                    )
                    return True

                current_app.logger.error(
                    "Resend did not return an email ID."
                )
                return False

            except Exception as e:
                current_app.logger.error(
                    f"Resend email delivery failed: {type(e).__name__}"
                )
                return False

        # Do not send external email during automated tests
        if current_app.config.get('TESTING'):
            return False

        # Local development fallback only
        current_app.logger.warning(
            "RESEND_API_KEY is missing. Trying SMTP fallback."
        )

        return cls._send_via_smtp(
            to_email,
            subject,
            html_content,
            text_content
        )

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
