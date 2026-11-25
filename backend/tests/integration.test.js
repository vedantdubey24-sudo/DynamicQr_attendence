import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { EmailService } from '../src/services/email.service.js';
import { OTPService } from '../src/services/otp.service.js';
import { QRTokenService } from '../src/services/qr.service.js';
import { AssignmentService } from '../src/services/assignment.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/environment.js';

describe('End-to-End Authentication & Faculty Lifecycle Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Pre-registration: Rejects unapproved email with 403', async () => {
    vi.spyOn(prisma.approvedTeacherEmail, 'findUnique').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/teacher/check-email')
      .send({ email: 'unauthorized@institution.edu' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not authorized');
  });

  it('2. Pre-registration: Rejects already used allowlist email with 409', async () => {
    vi.spyOn(prisma.approvedTeacherEmail, 'findUnique').mockResolvedValue({
      id: 1,
      email: 'used@institution.edu',
      is_used: true,
    });

    const res = await request(app)
      .post('/api/auth/teacher/check-email')
      .send({ email: 'used@institution.edu' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been used');
  });

  it('3. Pre-registration: Confirms valid approved email with 200', async () => {
    vi.spyOn(prisma.approvedTeacherEmail, 'findUnique').mockResolvedValue({
      id: 1,
      email: 'approved@institution.edu',
      is_used: false,
    });
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/teacher/check-email')
      .send({ email: 'approved@institution.edu' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('approved@institution.edu');
  });

  it('4. Send OTP: Successfully dispatches OTP email and records challenge', async () => {
    vi.spyOn(prisma.approvedTeacherEmail, 'findUnique').mockResolvedValue({
      id: 1,
      email: 'approved@institution.edu',
      is_used: false,
    });
    vi.spyOn(OTPService, 'checkRateLimit').mockResolvedValue({ allowed: true });
    vi.spyOn(OTPService, 'createChallenge').mockResolvedValue('654321');
    vi.spyOn(EmailService, 'sendOtpEmail').mockResolvedValue(true);
    vi.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'approved@institution.edu', purpose: 'TEACHER_REGISTRATION' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('OTP sent');
  });

  it('5. Verify OTP: Issues 15-minute verification token on valid OTP', async () => {
    vi.spyOn(OTPService, 'verifyOtp').mockResolvedValue({ valid: true, challenge_id: 10 });
    vi.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: 'approved@institution.edu',
        otp: '654321',
        purpose: 'TEACHER_REGISTRATION',
      });

    expect(res.status).toBe(200);
    expect(res.body.verification_token).toBeDefined();

    const decoded = jwt.verify(res.body.verification_token, env.JWT_SECRET);
    expect(decoded.type).toBe('EMAIL_VERIFICATION');
    expect(decoded.verified_email).toBe('approved@institution.edu');
  });

  it('6. Teacher Login: Blocks PENDING faculty account with 403', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 2,
      email: 'pending@institution.edu',
      role: 'TEACHER',
      status: 'PENDING',
    });

    const res = await request(app)
      .post('/api/auth/login/code')
      .send({ email: 'pending@institution.edu', code: 'ANYCODE123' });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.error).toContain('pending admin approval');
  });

  it('7. Teacher Login: Blocks REJECTED faculty account with 403', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
      id: 3,
      email: 'rejected@institution.edu',
      role: 'TEACHER',
      status: 'REJECTED',
    });

    const res = await request(app)
      .post('/api/auth/login/code')
      .send({ email: 'rejected@institution.edu', code: 'ANYCODE123' });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.error).toContain('rejected');
  });
});

describe('Dynamic QR Attendance Engine Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const teacherToken = jwt.sign(
    { sub: '10', role: 'TEACHER', email: 'teacher@test.edu' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  it('1. Prevents duplicate active sessions for the same teacher', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 10,
      role: 'TEACHER',
      status: 'APPROVED',
    });
    vi.spyOn(prisma.teacherAssignment, 'findFirst').mockResolvedValue({
      id: 1,
      teacher_id: 10,
      class_id: 1,
      division_id: 1,
      subject_id: 1,
    });
    // Active session still within 90s window
    vi.spyOn(prisma.attendanceSession, 'findFirst').mockResolvedValue({
      id: 99,
      teacher_id: 10,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 60000),
    });

    const res = await request(app)
      .post('/api/attendance/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_id: 1, division_id: 1, subject_id: 1 });

    expect(res.status).toBe(409);
    expect(res.body.active_session_id).toBe(99);
    expect(res.body.error).toContain('already have an active session');
  });

  it('2. Successfully creates session and generates first dynamic QR code', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 10,
      role: 'TEACHER',
      status: 'APPROVED',
    });
    vi.spyOn(prisma.teacherAssignment, 'findFirst').mockResolvedValue({
      id: 1,
      teacher_id: 10,
      class_id: 1,
      division_id: 1,
      subject_id: 1,
    });
    vi.spyOn(prisma.attendanceSession, 'findFirst').mockResolvedValue(null);

    const now = new Date();
    const sessionMock = {
      id: 105,
      teacher_id: 10,
      class_id: 1,
      division_id: 1,
      subject_id: 1,
      status: 'ACTIVE',
      starts_at: now,
      expires_at: new Date(now.getTime() + 90000),
      class_rel: { class_name: 'TE — 3rd Year' },
      division_rel: { division_name: 'A' },
      subject_rel: { subject_name: 'DBMS', subject_code: 'TE-4' },
    };

    vi.spyOn(QRTokenService, 'createSession').mockResolvedValue(sessionMock);
    vi.spyOn(QRTokenService, 'generateToken').mockResolvedValue({
      token: 'raw_crypto_token_sample_12345',
      token_id: 1,
      remaining_seconds: 90,
      expires_at: new Date(now.getTime() + 5000).toISOString(),
    });
    vi.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({});

    const res = await request(app)
      .post('/api/attendance/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class_id: 1, division_id: 1, subject_id: 1 });

    expect(res.status).toBe(201);
    expect(res.body.session.id).toBe(105);
    expect(res.body.qr.token).toBe('raw_crypto_token_sample_12345');
    expect(res.body.qr.remaining_seconds).toBe(90);
  });

  it('3. Concludes active session and revokes tokens', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 10,
      role: 'TEACHER',
      status: 'APPROVED',
    });
    const sessionMock = {
      id: 105,
      teacher_id: 10,
      status: 'ACTIVE',
      starts_at: new Date(),
      expires_at: new Date(Date.now() + 60000),
    };
    vi.spyOn(prisma.attendanceSession, 'findUnique')
      .mockResolvedValueOnce(sessionMock)
      .mockResolvedValueOnce({ ...sessionMock, status: 'CLOSED' });
    vi.spyOn(QRTokenService, 'closeSession').mockResolvedValue(true);
    vi.spyOn(prisma.securityAuditEvent, 'create').mockResolvedValue({});

    const res = await request(app)
      .post('/api/attendance/sessions/105/close')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('CLOSED');
    expect(res.body.message).toBe('Session closed');
  });

  it('4. Rejects request for current QR on expired session with 410 Gone', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 10,
      role: 'TEACHER',
      status: 'APPROVED',
    });
    const expiredMock = {
      id: 105,
      teacher_id: 10,
      status: 'EXPIRED',
      starts_at: new Date(Date.now() - 120000),
      expires_at: new Date(Date.now() - 30000),
    };
    vi.spyOn(prisma.attendanceSession, 'findUnique').mockResolvedValue(expiredMock);
    vi.spyOn(QRTokenService, 'checkAndExpireSession').mockResolvedValue(true);

    const res = await request(app)
      .get('/api/attendance/sessions/105/current-qr')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(410);
    expect(res.body.status).toBe('EXPIRED');
    expect(res.body.error).toContain('no longer active');
  });
});
