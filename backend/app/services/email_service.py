
"""
Email Service — Gmail API for OTP delivery and notifications.
"""

import os
import base64
import logging
from typing import Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


class EmailService:
    """Send transactional emails using Gmail API."""

    GMAIL_SCOPE = ["https://www.googleapis.com/auth/gmail.send"]

    @classmethod
    def _send_email(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email using Gmail API and an OAuth refresh token."""

        if current_app.config.get("TESTING"):
            return False

        if not to_email or "@" not in to_email:
            current_app.logger.error("Invalid recipient email address.")
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
                "Gmail API configuration is incomplete. "
                "Check Render environment variables."
            )
            return False

        try:
            credentials = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=cls.GMAIL_SCOPE
            )

            # Obtain a fresh Google access token.
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

            response = service.users().messages().send(
                userId="me",
                body={"raw": raw_message}
            ).execute()

            if response.get("id"):
                current_app.logger.info(
                    "Gmail API successfully sent an email."
                )
                return True

            current_app.logger.error(
                "Gmail API returned no message ID."
            )
            return False

        except Exception:
            current_app.logger.exception(
                "Gmail API email delivery failed."
            )
            return False

    @classmethod
    def send_otp_email(
        cls,
        to_email: str,
        otp: str,
        purpose: str
    ) -> bool:
        """Send OTP verification email."""

        purpose_label = {
            "TEACHER_REGISTRATION": "Teacher Registration",
            "LOGIN_CODE_RECOVERY": "Login Code Recovery"
        }.get(purpose, "Verification")

        subject = (
            f"QR Attendance System - {purpose_label} OTP"
        )

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif;
                     background-color: #f8f9fa; padding: 20px;">

            <div style="max-width: 480px; margin: auto;
                        background: white; border-radius: 12px;
                        padding: 32px;">

                <h2 style="color: #8B1E2B; text-align: center;">
                    {purpose_label}
                </h2>

                <p>Your one-time verification code is:</p>

                <div style="text-align: center; margin: 24px 0;">
                    <span style="background: #8B1E2B;
                                 color: white;
                                 font-size: 30px;
                                 font-weight: bold;
                                 letter-spacing: 8px;
                                 padding: 16px 28px;
                                 border-radius: 8px;
                                 display: inline-block;">
                        {otp}
                    </span>
                </div>

                <p>This code expires in 5 minutes.</p>

                <p style="color: #666; font-size: 13px;">
                    Do not share this code with anyone.
                </p>

                <hr>

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
            "It expires in 5 minutes. Do not share it."
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

        subject = "QR Attendance System - Your Login Code"

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif;
                     background-color: #f8f9fa; padding: 20px;">

            <div style="max-width: 480px; margin: auto;
                        background: white; border-radius: 12px;
                        padding: 32px;">

                <h2 style="color: #8B1E2B; text-align: center;">
                    Your Login Code
                </h2>

                <p>Your login code is:</p>

                <div style="text-align: center; margin: 24px 0;">
                    <span style="background: #8B1E2B;
                                 color: white;
                                 font-size: 24px;
                                 font-weight: bold;
                                 letter-spacing: 4px;
                                 padding: 16px 28px;
                                 border-radius: 8px;
                                 display: inline-block;">
                        {login_code}
                    </span>
                </div>

                <p>Save this code securely.</p>

                <p style="color: #666; font-size: 13px;">
                    Do not share this code with anyone.
                </p>

            </div>
        </body>
        </html>
        """

        text_content = (
            f"Your login code is: {login_code}. "
            "Save it securely and do not share it."
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
            "QR Attendance System - Login Code Changed"
        )

        html_content = """
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 480px; margin: auto;
                        background: white; padding: 32px;">
                <h2 style="color: #8B1E2B;">
                    Login Code Changed
                </h2>
                <p>
                    Your login code has been successfully changed.
                </p>
                <p>
                    If you did not make this change,
                    contact your administrator.
                </p>
            </div>
        </body>
        </html>
        """

        text_content = (
            "Your login code has been changed. "
            "Contact your administrator if this was not you."
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
            "QR Attendance System - Faculty Account Approved"
        )

        html_content = """
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 480px; margin: auto;
                        background: white; padding: 32px;">
                <h2 style="color: #8B1E2B;">
                    Account Approved
                </h2>
                <p>
                    Your faculty account has been approved
                    by the administrator.
                </p>
                <p>
                    You can now sign in using your registered
                    email and login code.
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
