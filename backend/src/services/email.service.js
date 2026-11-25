import { google } from 'googleapis';
import { env } from '../config/environment.js';

/**
 * Email Service — Gmail API (OAuth 2.0) for OTP delivery and notifications.
 * Direct replication of the original Flask EmailService.
 */
export class EmailService {
  static GMAIL_SCOPE = ['https://www.googleapis.com/auth/gmail.send'];

  /**
   * Build an RFC 2822 multipart/alternative MIME message and base64url-encode it
   * for the Gmail API `users.messages.send` endpoint.
   */
  static buildRawMessage({ from, to, subject, textContent, htmlContent }) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const headers = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    const parts = [];

    if (textContent) {
      parts.push(
        `--${boundary}\r\n` +
          'Content-Type: text/plain; charset="UTF-8"\r\n' +
          'Content-Transfer-Encoding: 7bit\r\n\r\n' +
          `${textContent}\r\n`
      );
    }

    if (htmlContent) {
      parts.push(
        `--${boundary}\r\n` +
          'Content-Type: text/html; charset="UTF-8"\r\n' +
          'Content-Transfer-Encoding: 7bit\r\n\r\n' +
          `${htmlContent}\r\n`
      );
    }

    const rawMime = `${headers.join('\r\n')}\r\n\r\n${parts.join('')}--${boundary}--`;
    return Buffer.from(rawMime, 'utf-8').toString('base64url');
  }

  /**
   * Create an authenticated Gmail API client using OAuth 2.0 refresh token.
   * Separated for clean mocking in tests.
   */
  static async getGmailClient(clientId, clientSecret, refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://oauth2.googleapis.com/token'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Obtain a fresh Google access token (mirrors credentials.refresh(Request())).
    await oauth2Client.getAccessToken();

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Send an email using Gmail API and an OAuth refresh token.
   * Never logs OTP values or login codes.
   */
  static async sendEmail(toEmail, subject, htmlContent, textContent = null) {
    if (process.env.NODE_ENV === 'test' && !this._allowInTest) {
      return false;
    }

    if (!toEmail || !toEmail.includes('@')) {
      console.error('Invalid recipient email address.');
      return false;
    }

    const clientId = process.env.GMAIL_CLIENT_ID || env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || env.GMAIL_REFRESH_TOKEN;
    const gmailAddress = process.env.GMAIL_ADDRESS || env.GMAIL_ADDRESS;

    if (!clientId || !clientSecret || !refreshToken || !gmailAddress) {
      console.error(
        'Gmail API configuration is incomplete. Check Render environment variables.'
      );
      return false;
    }

    try {
      const gmail = await this.getGmailClient(clientId, clientSecret, refreshToken);

      const rawMessage = this.buildRawMessage({
        from: `QR Attendance System <${gmailAddress}>`,
        to: toEmail,
        subject,
        textContent,
        htmlContent,
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage },
      });

      if (response?.data?.id) {
        console.info('Gmail API successfully sent an email.');
        return true;
      }

      console.error('Gmail API returned no message ID.');
      return false;
    } catch (err) {
      console.error('Gmail API email delivery failed.', err);
      return false;
    }
  }

  /**
   * Send OTP verification email.
   */
  static async sendOtpEmail(toEmail, otp, purpose) {
    const purposeLabel =
      {
        TEACHER_REGISTRATION: 'Teacher Registration',
        LOGIN_CODE_RECOVERY: 'Login Code Recovery',
      }[purpose] || 'Verification';

    const subject = `QR Attendance System - ${purposeLabel} OTP`;

    const htmlContent = `
        <html>
        <body style="font-family: Arial, sans-serif;
                     background-color: #f8f9fa; padding: 20px;">

            <div style="max-width: 480px; margin: auto;
                        background: white; border-radius: 12px;
                        padding: 32px;">

                <h2 style="color: #8B1E2B; text-align: center;">
                    ${purposeLabel}
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
                        ${otp}
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
        `;

    const textContent =
      `Your ${purposeLabel} OTP is: ${otp}. ` +
      'It expires in 5 minutes. Do not share it.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  /**
   * Send login code email to the teacher.
   */
  static async sendLoginCodeEmail(toEmail, loginCode) {
    const subject = 'QR Attendance System - Your Login Code';

    const htmlContent = `
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
                        ${loginCode}
                    </span>
                </div>

                <p>Save this code securely.</p>

                <p style="color: #666; font-size: 13px;">
                    Do not share this code with anyone.
                </p>

            </div>
        </body>
        </html>
        `;

    const textContent =
      `Your login code is: ${loginCode}. ` +
      'Save it securely and do not share it.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  /**
   * Notify teacher that their login code was changed.
   */
  static async sendCodeChangedNotification(toEmail) {
    const subject = 'QR Attendance System - Login Code Changed';

    const htmlContent = `
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
        `;

    const textContent =
      'Your login code has been changed. ' +
      'Contact your administrator if this was not you.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  /**
   * Send faculty account approval confirmation.
   */
  static async sendApprovalEmail(toEmail) {
    const subject = 'QR Attendance System - Faculty Account Approved';

    const htmlContent = `
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
        `;

    const textContent =
      'Your faculty account has been approved. ' +
      'You can now sign in using your login code.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }
}
