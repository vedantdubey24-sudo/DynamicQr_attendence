
"""
Email Service — Gmail API for OTP delivery and notifications.
"""

import os
import base64
from typing import Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


class EmailService:
    """Send transactional emails using Gmail API."""

    @classmethod
    def _send_email(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send email using Gmail API and OAuth refresh token."""

        if current_app.config.get("TESTING"):
            return False

        client_id = os.getenv("GMAIL_CLIENT_ID")
        client_secret = os.getenv("GMAIL_CLIENT_SECRET")
        refresh_token = os.getenv("GMAIL_REFRESH_TOKEN")
        gmail_address = os.getenv("GMAIL_ADDRESS")

        if not all([
            client_id,
            client_secret,
            refresh_token,
            gmail_address
        ]):
            current_app.logger.error(
                "Gmail API credentials are missing."
            )
            return False

        try:
            credentials = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=[
                    "https://www.googleapis.com/auth/gmail.send"
                ]
            )

            credentials.refresh(Request())

            service = build(
                "gmail",
                "v1",
                credentials=credentials,
                cache_discovery=False
            )

            message = MIMEMultipart("alternative")
            message["To"] = to_email
            message["From"] = (
                f"QR Attendance System <{gmail_address}>"
            )
            message["Subject"] = subject

            if text_content:
                message.attach(
                    MIMEText(text_content, "plain", "utf-8")
                )

            if html_content:
                message.attach(
                    MIMEText(html_content, "html", "utf-8")
                )

            raw_message = base64.urlsafe_b64encode(
                message.as_bytes()
            ).decode("utf-8")

            result = service.users().messages().send(
                userId="me",
                body={"raw": raw_message}
            ).execute()

            if result.get("id"):
                current_app.logger.info(
                    f"Gmail API email sent successfully to {to_email}"
                )
                return True

            current_app.logger.error(
                "Gmail API did not return a message ID."
            )
            return False

        except Exception as error:
            current_app.logger.error(
                f"Gmail API delivery failed: {type(error).__name__}"
            )
            return False

    @classmethod
    def send_otp_email(
        cls,
        to_email: str,
        otp: str,
        purpose: str
    ) -> bool:
        """
        Send OTP verification email.
        Never logs the OTP value.
        """

        purpose_label = {
            "TEACHER_REGISTRATION": "Teacher Registration",
            "LOGIN_CODE_RECOVERY": "Login Code Recovery",
        }.get(purpose, "Verification")

        subject = (
            f"QR Attendance System — {purpose_label} OTP"
        )

        html_content = f"""
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif;
                     margin: 0; padding: 20px;
                     background-color: #f8f9fa;">

            <div style="max-width: 480px; margin: 0 auto;
                        background: white; border-radius: 12px;
                        padding: 32px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px;
                                background: #D4A347;
                                margin: 0 auto 16px;"></div>

                    <h2 style="color: #8B1E2B; margin: 0;
                               font-size: 22px;">
                        {purpose_label}
                    </h2>
                </div>

                <p style="color: #333; font-size: 15px;
                          line-height: 1.6;">
                    Your one-time verification code is:
                </p>

                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block;
                                 background: #8B1E2B;
                                 color: white;
                                 font-size: 32px;
                                 font-weight: bold;
                                 letter-spacing: 8px;
                                 padding: 16px 32px;
                                 border-radius: 8px;">
                        {otp}
                    </span>
                </div>

                <p style="color: #666; font-size: 13px;
                          line-height: 1.6;">
                    This code expires in <strong>5 minutes</strong>.
                    Do not share it with anyone.
                </p>

                <hr style="border: none;
                           border-top: 1px solid #e5e7eb;
                           margin: 24px 0;">

                <p style="color: #999; font-size: 11px;
                          text-align: center;">
                    If you did not request this code,
                    please ignore this email.
                </p>

            </div>
        </body>
        </html>
        """

        text_content = (
            f"Your {purpose_label} OTP is: {otp}. "
            "It expires in 5 minutes."
        )

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )

    @classmethod
    def send_login_code_email(
        cls,
        to_email: str,
        login_code: str
    ) -> bool:
        """Send login code email to the teacher."""

        subject = (
            "QR Attendance System — Your Login Code"
        )

        html_content = f"""
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif;
                     margin: 0; padding: 20px;
                     background-color: #f8f9fa;">

            <div style="max-width: 480px; margin: 0 auto;
                        background: white; border-radius: 12px;
                        padding: 32px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px;
                                background: #D4A347;
                                margin: 0 auto 16px;"></div>

                    <h2 style="color: #8B1E2B; margin: 0;
                               font-size: 22px;">
                        Your Login Code
                    </h2>
                </div>

                <p style="color: #333; font-size: 15px;
                          line-height: 1.6;">
                    Your secure login code has been generated:
                </p>

                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block;
                                 background: #8B1E2B;
                                 color: white;
                                 font-size: 24px;
                                 font-weight: bold;
                                 letter-spacing: 4px;
                                 padding: 16px 32px;
                                 border-radius: 8px;
                                 word-break: break-all;">
                        {login_code}
                    </span>
                </div>

                <p style="color: #666; font-size: 13px;
                          line-height: 1.6;">
                    <strong>Important:</strong>
                    Save this code securely. You will need it to log in.
                    This code cannot be recovered — if you lose it,
                    use the "Forgot Login Code" feature.
                </p>

                <hr style="border: none;
                           border-top: 1px solid #e5e7eb;
                           margin: 24px 0;">

                <p style="color: #999; font-size: 11px;
                          text-align: center;">
                    Do not share this code with anyone.
                </p>

            </div>
        </body>
        </html>
        """

        text_content = (
            f"Your login code is: {login_code}. "
            "Save this securely."
        )

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )

    @classmethod
    def send_code_changed_notification(
        cls,
        to_email: str
    ) -> bool:
        """Notify teacher that their login code was changed."""

        subject = (
            "QR Attendance System — Login Code Changed"
        )

        html_content = """
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif;
                     margin: 0; padding: 20px;
                     background-color: #f8f9fa;">

            <div style="max-width: 480px; margin: 0 auto;
                        background: white; border-radius: 12px;
                        padding: 32px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px;
                                background: #D4A347;
                                margin: 0 auto 16px;"></div>

                    <h2 style="color: #8B1E2B; margin: 0;
                               font-size: 22px;">
                        Login Code Changed
                    </h2>
                </div>

                <p style="color: #333; font-size: 15px;
                          line-height: 1.6;">
                    Your login code for the QR Attendance System
                    has been successfully changed.
                </p>

                <p style="color: #666; font-size: 13px;
                          line-height: 1.6;">
                    If you did not make this change,
                    please contact your administrator immediately.
                </p>

            </div>
        </body>
        </html>
        """

        text_content = (
            "Your login code has been changed. "
            "Contact admin if this was not you."
        )

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )

    @classmethod
    def send_approval_email(
        cls,
        to_email: str
    ) -> bool:
        """Send faculty account approval confirmation."""

        subject = (
            "QR Attendance System — Faculty Account Approved"
        )

        html_content = """
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif;
                     margin: 0; padding: 20px;
                     background-color: #f8f9fa;">

            <div style="max-width: 480px; margin: 0 auto;
                        background: white; border-radius: 12px;
                        padding: 32px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 48px; height: 4px;
                                background: #D4A347;
                                margin: 0 auto 16px;"></div>

                    <h2 style="color: #8B1E2B; margin: 0;
                               font-size: 22px;">
                        Account Approved
                    </h2>
                </div>

                <p style="color: #333; font-size: 15px;
                          line-height: 1.6;">
                    Congratulations! Your faculty account has
                    been reviewed and approved by the administrator.
                </p>

                <p style="color: #666; font-size: 13px;
                          line-height: 1.6;">
                    You may now sign in using your registered email
                    and personal login code to start taking attendance.
                </p>

            </div>
        </body>
        </html>
        """

        text_content = (
            "Your faculty account has been approved. "
            "You can now sign in using your login code."
        )

        return cls._send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )
