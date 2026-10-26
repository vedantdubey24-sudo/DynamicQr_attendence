"""
Email Service — Gmail SMTP for OTP delivery and notifications.
"""

import smtplib
from email.message import EmailMessage
from flask import current_app


class EmailService:
    """Send emails using Gmail SMTP with App Password."""

    @staticmethod
    def send_otp_email(to_email: str, otp: str, purpose: str) -> bool:
        """
        Send OTP verification email.
        Returns True on success, False on failure.
        Never logs the OTP value.
        """
        try:
            gmail_address = current_app.config['GMAIL_ADDRESS']
            app_password = current_app.config['GMAIL_APP_PASSWORD']
            smtp_host = current_app.config['SMTP_HOST']
            smtp_port = current_app.config['SMTP_PORT']

            if not gmail_address or not app_password:
                print(f"\n==========================================")
                print(f"[LOCAL DEV EMAIL] To: {to_email}")
                print(f"[LOCAL DEV OTP] Code: {otp} ({purpose})")
                print(f"==========================================\n", flush=True)
                current_app.logger.info(f"Dev mode OTP for {to_email}: {otp}")
                return True

            purpose_label = {
                'TEACHER_REGISTRATION': 'Teacher Registration',
                'LOGIN_CODE_RECOVERY': 'Login Code Recovery',
            }.get(purpose, 'Verification')

            msg = EmailMessage()
            msg['Subject'] = f'QR Attendance System — {purpose_label} OTP'
            msg['From'] = f'QR Attendance System <{gmail_address}>'
            msg['To'] = to_email

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

            msg.set_content(f'Your {purpose_label} OTP is: {otp}. It expires in 5 minutes.')
            msg.add_alternative(html_content, subtype='html')

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(gmail_address, app_password)
                server.send_message(msg)

            current_app.logger.info(f'OTP email sent to {to_email} for {purpose}')
            return True

        except smtplib.SMTPException as e:
            current_app.logger.error(f'SMTP error sending to {to_email}: {type(e).__name__}')
            return False
        except Exception as e:
            current_app.logger.error(f'Email send error: {type(e).__name__}')
            return False

    @staticmethod
    def send_login_code_email(to_email: str, login_code: str) -> bool:
        """Send the generated login code to the teacher after registration/recovery."""
        try:
            gmail_address = current_app.config['GMAIL_ADDRESS']
            app_password = current_app.config['GMAIL_APP_PASSWORD']
            smtp_host = current_app.config['SMTP_HOST']
            smtp_port = current_app.config['SMTP_PORT']

            if not gmail_address or not app_password:
                print(f"\n==========================================")
                print(f"[LOCAL DEV EMAIL] To: {to_email}")
                print(f"[LOCAL DEV LOGIN CODE]: {login_code}")
                print(f"==========================================\n", flush=True)
                return True

            msg = EmailMessage()
            msg['Subject'] = 'QR Attendance System — Your Login Code'
            msg['From'] = f'QR Attendance System <{gmail_address}>'
            msg['To'] = to_email

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

            msg.set_content(f'Your login code is: {login_code}. Save this securely.')
            msg.add_alternative(html_content, subtype='html')

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(gmail_address, app_password)
                server.send_message(msg)

            return True
        except Exception as e:
            current_app.logger.error(f'Login code email error: {type(e).__name__}')
            return False

    @staticmethod
    def send_code_changed_notification(to_email: str) -> bool:
        """Notify teacher that their login code was changed."""
        try:
            gmail_address = current_app.config['GMAIL_ADDRESS']
            app_password = current_app.config['GMAIL_APP_PASSWORD']
            smtp_host = current_app.config['SMTP_HOST']
            smtp_port = current_app.config['SMTP_PORT']

            if not gmail_address or not app_password:
                return False

            msg = EmailMessage()
            msg['Subject'] = 'QR Attendance System — Login Code Changed'
            msg['From'] = f'QR Attendance System <{gmail_address}>'
            msg['To'] = to_email

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

            msg.set_content('Your login code has been changed. Contact admin if this was not you.')
            msg.add_alternative(html_content, subtype='html')

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(gmail_address, app_password)
                server.send_message(msg)

            return True
        except Exception as e:
            current_app.logger.error(f'Notification email error: {type(e).__name__}')
            return False

    @staticmethod
    def send_approval_email(to_email: str) -> bool:
        """Send account approval confirmation to faculty."""
        try:
            gmail_address = current_app.config['GMAIL_ADDRESS']
            app_password = current_app.config['GMAIL_APP_PASSWORD']
            smtp_host = current_app.config['SMTP_HOST']
            smtp_port = current_app.config['SMTP_PORT']

            if not gmail_address or not app_password:
                print(f"\n==========================================")
                print(f"[LOCAL DEV EMAIL] To: {to_email}")
                print(f"[LOCAL DEV APPROVAL]: Your faculty account has been approved!")
                print(f"==========================================\n", flush=True)
                return True

            msg = EmailMessage()
            msg['Subject'] = 'QR Attendance System — Faculty Account Approved'
            msg['From'] = f'QR Attendance System <{gmail_address}>'
            msg['To'] = to_email

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
            msg.set_content('Your faculty account has been approved. You can now sign in using your login code.')
            msg.add_alternative(html_content, subtype='html')

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(gmail_address, app_password)
                server.send_message(msg)

            return True
        except Exception:
            return False
