import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { env } from '../config/environment.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export class EmailService {
  static async sendViaSmtp(toEmail, subject, htmlContent, textContent = null) {
    if (!env.GMAIL_ADDRESS || !env.GMAIL_APP_PASSWORD) {
      console.warn('SMTP delivery skipped: GMAIL_ADDRESS or GMAIL_APP_PASSWORD not configured.');
      return false;
    }

    try {
      const cleanedPwd = env.GMAIL_APP_PASSWORD.replace(/\s+/g, '').trim();
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.GMAIL_ADDRESS,
          pass: cleanedPwd,
        },
      });

      await transporter.sendMail({
        from: `QR Attendance System <${env.GMAIL_ADDRESS}>`,
        to: toEmail,
        subject,
        html: htmlContent,
        text: textContent || undefined,
      });

      console.log(`Email successfully sent via SMTP to ${toEmail}`);
      return true;
    } catch (err) {
      console.error(`SMTP error sending email to ${toEmail}:`, err.message);
      return false;
    }
  }

  static async sendEmail(toEmail, subject, htmlContent, textContent = null) {
    if (!toEmail || !toEmail.includes('@')) {
      console.error('Invalid recipient email address.');
      return false;
    }

    // Attempt Resend if configured
    if (resend) {
      try {
        const { data, error } = await resend.emails.send({
          from: env.EMAIL_FROM,
          to: [toEmail],
          subject,
          html: htmlContent,
          text: textContent || undefined,
        });

        if (data && data.id) {
          console.log(`Email successfully accepted by Resend for ${toEmail} (ID: ${data.id})`);
          return true;
        }

        if (error) {
          console.warn(`Resend API error for ${toEmail}: ${error.message}. Attempting SMTP fallback.`);
        }
      } catch (err) {
        console.warn(`Unexpected Resend error for ${toEmail}: ${err.message}. Attempting SMTP fallback.`);
      }
    }

    // In testing environment without explicit SMTP, do not attempt network SMTP
    if (process.env.NODE_ENV === 'test') {
      return false;
    }

    // Fallback to SMTP
    return this.sendViaSmtp(toEmail, subject, htmlContent, textContent);
  }

  static async sendOtpEmail(toEmail, otp, purpose) {
    const purposeLabel = purpose === 'TEACHER_REGISTRATION'
      ? 'Teacher Registration'
      : purpose === 'LOGIN_CODE_RECOVERY'
        ? 'Login Code Recovery'
        : 'Verification';

    const subject = `QR Attendance System — ${purposeLabel} OTP`;
    const htmlContent = `
      <html>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
            <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">${purposeLabel}</h2>
          </div>
          <p style="color: #333; font-size: 15px; line-height: 1.6;">Your one-time verification code is:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="display: inline-block; background: #8B1E2B; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; border-radius: 8px;">
              ${otp}
            </span>
          </div>
          <p style="color: #666; font-size: 13px; line-height: 1.6;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #999; font-size: 11px; text-align: center;">If you did not request this code, please ignore this email.</p>
        </div>
      </body>
      </html>
    `;
    const textContent = `Your ${purposeLabel} OTP is: ${otp}. It expires in 5 minutes.`;

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  static async sendLoginCodeEmail(toEmail, loginCode) {
    const subject = 'QR Attendance System — Your Login Code';
    const htmlContent = `
      <html>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 48px; height: 4px; background: #D4A347; margin: 0 auto 16px;"></div>
            <h2 style="color: #8B1E2B; margin: 0; font-size: 22px;">Your Login Code</h2>
          </div>
          <p style="color: #333; font-size: 15px; line-height: 1.6;">Your secure login code has been generated:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="display: inline-block; background: #8B1E2B; color: white; font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 16px 32px; border-radius: 8px; word-break: break-all;">
              ${loginCode}
            </span>
          </div>
          <p style="color: #666; font-size: 13px; line-height: 1.6;">
            <strong>Important:</strong> Save this code securely. You will need it to log in.
            This code cannot be recovered — if you lose it, you will need to use the "Forgot Login Code" feature.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #999; font-size: 11px; text-align: center;">Do not share this code with anyone.</p>
        </div>
      </body>
      </html>
    `;
    const textContent = `Your login code is: ${loginCode}. Save this securely.`;

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  static async sendCodeChangedNotification(toEmail) {
    const subject = 'QR Attendance System — Login Code Changed';
    const htmlContent = `
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
    `;
    const textContent = 'Your login code has been changed. Contact admin if this was not you.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }

  static async sendApprovalEmail(toEmail) {
    const subject = 'QR Attendance System — Faculty Account Approved';
    const htmlContent = `
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
    `;
    const textContent = 'Your faculty account has been approved. You can now sign in using your login code.';

    return this.sendEmail(toEmail, subject, htmlContent, textContent);
  }
}
