import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { OTPService } from '../src/services/otp.service.js';
import { EmailService } from '../src/services/email.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/environment.js';

describe('Health & Error Handlers', () => {
  it('GET /health returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.runtime).toBe('Node.js');
  });

  it('GET /api/health returns 200 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('Undefined routes return 404', async () => {
    const res = await request(app).get('/api/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('Authentication Middleware Security', () => {
  it('Protected route rejects missing token with 401 and code MISSING_TOKEN', async () => {
    const res = await request(app).get('/api/teacher/profile');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('Protected route rejects invalid token with 401 and code INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/teacher/profile')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('Protected route rejects expired token with 401 and code TOKEN_EXPIRED', async () => {
    const expiredToken = jwt.sign(
      { sub: '1', role: 'TEACHER' },
      env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/teacher/profile')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('OTP Verification Engine', () => {
  it('Validates 6-digit numeric OTP format strictly', () => {
    expect(OTPService.isValidOtp('123456')).toBe(true);
    expect(OTPService.isValidOtp('12345')).toBe(false);
    expect(OTPService.isValidOtp('1234567')).toBe(false);
    expect(OTPService.isValidOtp('12345a')).toBe(false);
    expect(OTPService.isValidOtp('')).toBe(false);
    expect(OTPService.isValidOtp(null)).toBe(false);
  });

  it('Computes reproducible HMAC-SHA256 bound to email and purpose', () => {
    const h1 = OTPService.computeHmac('123456', 'faculty@test.edu', 'TEACHER_REGISTRATION');
    const h2 = OTPService.computeHmac('123456', 'faculty@test.edu', 'TEACHER_REGISTRATION');
    const h3 = OTPService.computeHmac('123456', 'other@test.edu', 'TEACHER_REGISTRATION');
    const h4 = OTPService.computeHmac('123456', 'faculty@test.edu', 'LOGIN_CODE_RECOVERY');

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).not.toBe(h4);
  });
});

describe('Auth Endpoints Validation & Protection', () => {
  it('POST /api/auth/teacher/check-email rejects missing email', async () => {
    const res = await request(app)
      .post('/api/auth/teacher/check-email')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Valid email address required');
  });

  it('POST /api/auth/send-otp rejects invalid purpose', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'test@institution.edu', purpose: 'INVALID_PURPOSE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid purpose');
  });

  it('POST /api/auth/verify-otp requires exactly 6-digit OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'test@institution.edu', otp: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP must contain exactly 6 digits.');
  });

  it('POST /api/auth/register/teacher requires verification token', async () => {
    const res = await request(app)
      .post('/api/auth/register/teacher')
      .send({
        full_name: 'Dr. Test',
        department: 'Computer Engineering',
        designation: 'Professor',
        erp_id: 'ERP-101',
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid verification token');
  });
});

describe('Admin Endpoints Validation & Protection', () => {
  it('POST /api/admin/login requires email and password', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  it('Protected admin route rejects request from non-admin JWT', async () => {
    const teacherToken = jwt.sign(
      { sub: '1', role: 'TEACHER', email: 'teacher@test.edu' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get('/api/admin/approved-teacher-emails')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });
});
