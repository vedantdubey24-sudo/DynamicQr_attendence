import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailService } from '../src/services/email.service.js';

describe('EmailService — Gmail API (OAuth 2.0)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    EmailService._allowInTest = true;
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    process.env.GMAIL_ADDRESS = 'sender@institution.edu';
  });

  afterEach(() => {
    EmailService._allowInTest = false;
    process.env = { ...originalEnv };
  });

  it('Returns false in test mode by default (mirrors Flask TESTING check)', async () => {
    EmailService._allowInTest = false;
    const spy = vi.spyOn(EmailService, 'getGmailClient');
    const result = await EmailService.sendOtpEmail('faculty@institution.edu', '123456', 'TEACHER_REGISTRATION');
    expect(result).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Rejects invalid recipient email addresses', async () => {
    const spy = vi.spyOn(EmailService, 'getGmailClient');
    expect(await EmailService.sendEmail('', 'Subject', '<p>Hi</p>')).toBe(false);
    expect(await EmailService.sendEmail('invalid-email', 'Subject', '<p>Hi</p>')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Returns false when Gmail OAuth credentials are incomplete', async () => {
    delete process.env.GMAIL_REFRESH_TOKEN;
    const spy = vi.spyOn(EmailService, 'getGmailClient');
    const result = await EmailService.sendOtpEmail('faculty@institution.edu', '123456', 'TEACHER_REGISTRATION');
    expect(result).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Sends OTP email via mocked Gmail API and returns true when message ID is returned', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'gmail_msg_123' } });
    vi.spyOn(EmailService, 'getGmailClient').mockResolvedValue({
      users: { messages: { send: mockSend } },
    });

    const result = await EmailService.sendOtpEmail(
      'faculty@institution.edu',
      '654321',
      'TEACHER_REGISTRATION'
    );

    expect(result).toBe(true);
    expect(EmailService.getGmailClient).toHaveBeenCalledWith(
      'test-client-id',
      'test-client-secret',
      'test-refresh-token'
    );
    expect(mockSend).toHaveBeenCalledTimes(1);

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.userId).toBe('me');
    const decodedMime = Buffer.from(callArg.requestBody.raw, 'base64url').toString('utf-8');
    expect(decodedMime).toContain('To: faculty@institution.edu');
    expect(decodedMime).toContain('From: QR Attendance System <sender@institution.edu>');
    expect(decodedMime).toContain('Subject: QR Attendance System - Teacher Registration OTP');
    expect(decodedMime).toContain('654321');
    expect(decodedMime).toContain('Your Teacher Registration OTP is: 654321.');
  });

  it('Sends recovery OTP email with Login Code Recovery subject', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'gmail_msg_456' } });
    vi.spyOn(EmailService, 'getGmailClient').mockResolvedValue({
      users: { messages: { send: mockSend } },
    });

    const result = await EmailService.sendOtpEmail(
      'faculty@institution.edu',
      '112233',
      'LOGIN_CODE_RECOVERY'
    );

    expect(result).toBe(true);
    const decodedMime = Buffer.from(mockSend.mock.calls[0][0].requestBody.raw, 'base64url').toString('utf-8');
    expect(decodedMime).toContain('Subject: QR Attendance System - Login Code Recovery OTP');
    expect(decodedMime).toContain('112233');
  });

  it('Sends login code, code-changed, and approval emails with exact Flask subjects', async () => {
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'gmail_msg_789' } });
    vi.spyOn(EmailService, 'getGmailClient').mockResolvedValue({
      users: { messages: { send: mockSend } },
    });

    expect(await EmailService.sendLoginCodeEmail('t@inst.edu', 'CODE999')).toBe(true);
    expect(await EmailService.sendCodeChangedNotification('t@inst.edu')).toBe(true);
    expect(await EmailService.sendApprovalEmail('t@inst.edu')).toBe(true);

    const subjects = mockSend.mock.calls.map((c) => {
      const mime = Buffer.from(c[0].requestBody.raw, 'base64url').toString('utf-8');
      return mime.match(/Subject: (.+)/)?.[1]?.trim();
    });

    expect(subjects).toEqual([
      'QR Attendance System - Your Login Code',
      'QR Attendance System - Login Code Changed',
      'QR Attendance System - Faculty Account Approved',
    ]);
  });

  it('Returns false when Gmail API returns no message ID or throws an error', async () => {
    const mockSendNoId = vi.fn().mockResolvedValue({ data: {} });
    vi.spyOn(EmailService, 'getGmailClient').mockResolvedValueOnce({
      users: { messages: { send: mockSendNoId } },
    });
    expect(await EmailService.sendApprovalEmail('t@inst.edu')).toBe(false);

    vi.spyOn(EmailService, 'getGmailClient').mockRejectedValueOnce(new Error('OAuth invalid_grant'));
    expect(await EmailService.sendApprovalEmail('t@inst.edu')).toBe(false);
  });
});
