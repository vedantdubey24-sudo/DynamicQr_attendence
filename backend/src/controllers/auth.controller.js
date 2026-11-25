import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';
import { OTPService } from '../services/otp.service.js';
import { EmailService } from '../services/email.service.js';
import { AssignmentService } from '../services/assignment.service.js';
import { logAuditEvent } from '../utils/audit.utils.js';
import { verifyPasswordOrCode, hashPasswordOrCode } from '../utils/hash.utils.js';
import { DEPARTMENTS } from '../constants/catalogue.js';

export class AuthController {
  // POST /api/auth/teacher/check-email
  static async checkEmail(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address required' });
      }

      const approved = await prisma.approvedTeacherEmail.findUnique({
        where: { email },
      });

      if (!approved) {
        return res.status(403).json({
          error: 'Invalid input: This email is not authorized for teacher registration.',
        });
      }

      if (approved.is_used) {
        return res.status(409).json({ error: 'This email has already been used for registration.' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { email, role: 'TEACHER' },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      return res.status(200).json({
        message: 'Email is approved for registration',
        email,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/send-otp
  static async sendOtp(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const purpose = req.body?.purpose || 'TEACHER_REGISTRATION';

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address required' });
      }

      if (!['TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY'].includes(purpose)) {
        return res.status(400).json({ error: 'Invalid purpose' });
      }

      if (purpose === 'TEACHER_REGISTRATION') {
        const approved = await prisma.approvedTeacherEmail.findUnique({
          where: { email },
        });
        if (!approved) {
          return res.status(403).json({
            error: 'Invalid input: This email is not authorized for teacher registration.',
          });
        }
        if (approved.is_used) {
          return res.status(409).json({ error: 'This email has already been used for registration.' });
        }
      }

      if (purpose === 'LOGIN_CODE_RECOVERY') {
        const user = await prisma.user.findFirst({
          where: { email, role: 'TEACHER' },
        });
        if (!user || user.status !== 'APPROVED') {
          return res.status(200).json({ message: 'If the email is registered, an OTP will be sent.' });
        }
      }

      // Check rate limits
      const rateCheck = await OTPService.checkRateLimit(email, purpose);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: rateCheck.error,
          retry_after: rateCheck.retry_after,
        });
      }

      // Create challenge & send email
      const otp = await OTPService.createChallenge(email, purpose);
      const emailSent = await EmailService.sendOtpEmail(email, otp, purpose);

      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
      }

      await logAuditEvent('OTP_SENT', null, req.ip, { email, purpose });

      return res.status(200).json({ message: 'OTP sent to your email address.' });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/verify-otp
  static async verifyOtp(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const otpValue = req.body?.otp;
      const purpose = req.body?.purpose || 'TEACHER_REGISTRATION';

      if (!email || typeof otpValue !== 'string') {
        return res.status(400).json({ error: 'Email and OTP are required' });
      }

      const otp = otpValue.trim();
      if (!OTPService.isValidOtp(otp)) {
        return res.status(400).json({ error: 'OTP must contain exactly 6 digits.' });
      }

      const result = await OTPService.verifyOtp(email, purpose, otp);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      // Generate a short-lived 15-minute verification token
      const verificationToken = jwt.sign(
        {
          sub: email,
          purpose,
          verified_email: email,
          type: 'EMAIL_VERIFICATION',
        },
        env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      await logAuditEvent('OTP_VERIFIED', null, req.ip, { email, purpose });

      return res.status(200).json({
        message: 'OTP verified successfully',
        verification_token: verificationToken,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/register/teacher
  static async registerTeacher(req, res, next) {
    try {
      // Validate verification token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid verification token' });
      }

      const token = authHeader.split(' ')[1];
      let claims;
      try {
        claims = jwt.verify(token, env.JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid verification token' });
      }

      if (claims.type !== 'EMAIL_VERIFICATION' || claims.purpose !== 'TEACHER_REGISTRATION') {
        return res.status(401).json({ error: 'Token not valid for registration' });
      }

      const verifiedEmail = claims.verified_email || claims.sub;
      if (!verifiedEmail) {
        return res.status(401).json({ error: 'Invalid verification token' });
      }

      const fullName = (req.body?.full_name || '').trim();
      const department = (req.body?.department || '').trim();
      const designation = (req.body?.designation || '').trim();
      const erpId = (req.body?.erp_id || req.body?.staff_id || '').trim();

      if (!fullName || !department || !designation || !erpId) {
        return res.status(400).json({
          error: 'All fields are required: full_name, department, designation, erp_id',
        });
      }

      // Check allowlist
      const approved = await prisma.approvedTeacherEmail.findFirst({
        where: { email: verifiedEmail, is_used: false },
      });

      if (!approved) {
        return res.status(403).json({ error: 'Email is not available for registration.' });
      }

      // Check existing user
      const existingUser = await prisma.user.findUnique({
        where: { email: verifiedEmail },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      // Department matching
      let matchedDeptName = null;
      for (const dName of DEPARTMENTS) {
        if (dName.toLowerCase() === department.toLowerCase()) {
          matchedDeptName = dName;
          break;
        }
      }
      if (!matchedDeptName) {
        return res.status(400).json({
          error: 'Invalid department selected. Please choose from the 9 official departments.',
        });
      }

      let dept = await prisma.department.findUnique({
        where: { name: matchedDeptName },
      });
      if (!dept) {
        dept = await prisma.department.create({
          data: { name: matchedDeptName },
        });
      }

      // Check ERP ID duplicate
      const existingStaff = await prisma.teacherProfile.findUnique({
        where: { staff_id: erpId },
      });
      if (existingStaff) {
        return res.status(409).json({ error: 'ERP ID already in use.' });
      }

      // Generate 16-char urlsafe login code (matches Flask secrets.token_urlsafe(12)) & hash
      const loginCode = crypto.randomBytes(12).toString('base64url');
      const codeHash = await hashPasswordOrCode(loginCode);

      const assignmentsData = req.body?.teaching_assignments || req.body?.assignments || [];

      // Atomic registration transaction
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: verifiedEmail,
            role: 'TEACHER',
            status: 'PENDING',
          },
        });

        await tx.teacherProfile.create({
          data: {
            user_id: user.id,
            full_name: fullName,
            department: dept.name,
            department_id: dept.id,
            designation,
            staff_id: erpId,
          },
        });

        await tx.loginCodeCredential.create({
          data: {
            user_id: user.id,
            code_hash: codeHash,
            is_revoked: false,
          },
        });

        await tx.approvedTeacherEmail.update({
          where: { id: approved.id },
          data: {
            is_used: true,
            used_at: new Date(),
          },
        });

        return user;
      });

      // Save assignments
      await AssignmentService.saveTeacherAssignments(result.id, assignmentsData);

      await logAuditEvent('TEACHER_REGISTERED', result.id, req.ip, {
        email: verifiedEmail,
        erp_id: erpId,
        department: dept.name,
      });

      // Send login code via email
      await EmailService.sendLoginCodeEmail(verifiedEmail, loginCode);

      return res.status(201).json({
        message: 'Registration successful! Your login code has been sent to your email.',
        user: {
          id: result.id,
          email: result.email,
          role: result.role,
          status: result.status,
          created_at: result.created_at.toISOString(),
        },
        login_code: loginCode,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/login/code
  static async loginWithCode(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const code = (req.body?.code || '').trim();

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and login code are required' });
      }

      const user = await prisma.user.findFirst({
        where: { email, role: 'TEACHER' },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.status !== 'APPROVED') {
        const statusMessages = {
          PENDING: 'Your account is pending admin approval.',
          REJECTED: 'Your registration has been rejected. Contact the administrator.',
          SUSPENDED: 'Your account has been suspended. Contact the administrator.',
        };
        return res.status(403).json({
          error: statusMessages[user.status] || 'Account is not active.',
          status: user.status,
        });
      }

      // Find active login credential
      const credential = await prisma.loginCodeCredential.findFirst({
        where: { user_id: user.id, is_revoked: false },
        orderBy: { created_at: 'desc' },
      });

      if (!credential) {
        return res.status(401).json({
          error: 'No active login code. Use "Forgot Login Code" to generate a new one.',
        });
      }

      if (credential.expires_at && new Date() > new Date(credential.expires_at)) {
        return res.status(401).json({
          error: 'Login code has expired. Use "Forgot Login Code" to generate a new one.',
        });
      }

      // Check code hash with Werkzeug and bcrypt compatibility
      const { match, needsRehash } = await verifyPasswordOrCode(code, credential.code_hash);

      if (!match) {
        await logAuditEvent('LOGIN_FAILED', null, req.ip, { email });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Gradual background rehash to bcrypt if legacy Werkzeug hash was used
      if (needsRehash) {
        try {
          const newBcryptHash = await hashPasswordOrCode(code);
          await prisma.loginCodeCredential.update({
            where: { id: credential.id },
            data: { code_hash: newBcryptHash },
          });
        } catch (rehashErr) {
          console.warn('Rehash of login code to bcrypt failed:', rehashErr.message);
        }
      }

      const token = jwt.sign(
        {
          sub: String(user.id),
          role: 'TEACHER',
          email: user.email,
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      await logAuditEvent('TEACHER_LOGIN_SUCCESS', user.id, req.ip);

      return res.status(200).json({
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          created_at: user.created_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/logout
  static async logout(req, res, next) {
    try {
      const actorId = req.user?.sub ? parseInt(req.user.sub, 10) : null;
      await logAuditEvent('LOGOUT', actorId, req.ip);
      return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/recovery/send-otp
  static async recoverySendOtp(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const genericMsg = 'If the email is registered, an OTP will be sent.';
      const user = await prisma.user.findFirst({
        where: { email, role: 'TEACHER' },
      });

      if (!user || user.status !== 'APPROVED') {
        return res.status(200).json({ message: genericMsg });
      }

      const rateCheck = await OTPService.checkRateLimit(email, 'LOGIN_CODE_RECOVERY');
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: rateCheck.error,
          retry_after: rateCheck.retry_after,
        });
      }

      const otp = await OTPService.createChallenge(email, 'LOGIN_CODE_RECOVERY');
      const emailSent = await EmailService.sendOtpEmail(email, otp, 'LOGIN_CODE_RECOVERY');

      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
      }

      await logAuditEvent('OTP_SENT', null, req.ip, { email, purpose: 'LOGIN_CODE_RECOVERY' });

      return res.status(200).json({ message: genericMsg });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/recovery/verify-otp
  static async recoveryVerifyOtp(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const otpValue = req.body?.otp;

      if (!email || typeof otpValue !== 'string') {
        return res.status(400).json({ error: 'Email and OTP are required' });
      }

      const otp = otpValue.trim();
      if (!OTPService.isValidOtp(otp)) {
        return res.status(400).json({ error: 'OTP must contain exactly 6 digits.' });
      }

      const result = await OTPService.verifyOtp(email, 'LOGIN_CODE_RECOVERY', otp);
      if (!result.valid) {
        return res.status(400).json({ error: result.error });
      }

      const user = await prisma.user.findFirst({
        where: { email, role: 'TEACHER' },
      });
      if (!user || user.status !== 'APPROVED') {
        return res.status(403).json({ error: 'Account not eligible for recovery' });
      }

      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.recoveryAuthorization.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          is_consumed: false,
        },
      });

      return res.status(200).json({
        message: 'Recovery authorized',
        recovery_token: rawToken,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/auth/recovery/reset-login-code
  static async resetLoginCode(req, res, next) {
    try {
      const recoveryToken = (req.body?.recovery_token || '').trim();
      const email = (req.body?.email || '').trim().toLowerCase();

      if (!recoveryToken || !email) {
        return res.status(400).json({ error: 'Recovery token and email are required' });
      }

      const user = await prisma.user.findFirst({
        where: { email, role: 'TEACHER' },
      });
      if (!user || user.status !== 'APPROVED') {
        return res.status(403).json({ error: 'Account not eligible' });
      }

      const tokenHash = crypto.createHash('sha256').update(recoveryToken).digest('hex');
      const now = new Date();

      const recovery = await prisma.recoveryAuthorization.findFirst({
        where: {
          user_id: user.id,
          token_hash: tokenHash,
          is_consumed: false,
        },
      });

      if (!recovery) {
        return res.status(401).json({ error: 'Invalid recovery token' });
      }

      if (now > new Date(recovery.expires_at)) {
        return res.status(401).json({ error: 'Recovery token has expired. Please start over.' });
      }

      // Generate new 16-char login code (matches Flask secrets.token_urlsafe(12)) & hash
      const newCode = crypto.randomBytes(12).toString('base64url');
      const codeHash = await hashPasswordOrCode(newCode);

      await prisma.$transaction([
        prisma.recoveryAuthorization.update({
          where: { id: recovery.id },
          data: { is_consumed: true },
        }),
        prisma.loginCodeCredential.updateMany({
          where: { user_id: user.id, is_revoked: false },
          data: { is_revoked: true },
        }),
        prisma.loginCodeCredential.create({
          data: {
            user_id: user.id,
            code_hash: codeHash,
            is_revoked: false,
          },
        }),
      ]);

      await logAuditEvent('LOGIN_CODE_RESET', user.id, req.ip);

      await EmailService.sendLoginCodeEmail(email, newCode);
      await EmailService.sendCodeChangedNotification(email);

      return res.status(200).json({
        message: 'Login code has been reset. The new code has been sent to your email.',
        login_code: newCode,
      });
    } catch (err) {
      next(err);
    }
  }
}
