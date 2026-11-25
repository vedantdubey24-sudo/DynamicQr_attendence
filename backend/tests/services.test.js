import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRTokenService } from '../src/services/qr.service.js';
import { AssignmentService } from '../src/services/assignment.service.js';
import { OTPService } from '../src/services/otp.service.js';
import { prisma } from '../src/config/database.js';
import crypto from 'crypto';

describe('QRTokenService Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Has correct timing constants: 90s session duration and 5s rotation', () => {
    expect(QRTokenService.SESSION_DURATION_SECONDS).toBe(90);
    expect(QRTokenService.TOKEN_ROTATION_SECONDS).toBe(5);
  });

  it('generateToken stores SHA-256 hash and preserves original Flask rotation behavior (does not revoke prior tokens)', async () => {
    const updateManySpy = vi.spyOn(prisma.qRToken, 'updateMany').mockResolvedValue({ count: 0 });
    const createSpy = vi.spyOn(prisma.qRToken, 'create').mockResolvedValue({ id: 55 });

    const session = {
      id: 101,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 60000),
    };

    const result = await QRTokenService.generateToken(session);

    expect(result).not.toBeNull();
    expect(result.token).toHaveLength(43); // 32 bytes base64url
    expect(result.token_id).toBe(55);
    expect(updateManySpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);

    const savedData = createSpy.mock.calls[0][0].data;
    const expectedHash = crypto.createHash('sha256').update(result.token).digest('hex');
    expect(savedData.token_hash).toBe(expectedHash);
    expect(savedData.is_revoked).toBe(false);
  });

  it('Formats session dictionary with all required frontend properties', () => {
    const mockSession = {
      id: 101,
      teacher_id: 1,
      class_id: 2,
      division_id: 3,
      subject_id: 4,
      status: 'ACTIVE',
      starts_at: new Date('2026-11-23T00:00:00Z'),
      expires_at: new Date('2026-11-23T00:01:30Z'),
      closed_at: null,
      class_rel: { class_name: 'TE — 3rd Year' },
      division_rel: { division_name: 'A' },
      subject_rel: { subject_name: 'DBMS', subject_code: 'TE-4' },
    };

    const formatted = QRTokenService.formatSessionDict(mockSession);
    expect(formatted.id).toBe(101);
    expect(formatted.class_name).toBe('TE — 3rd Year');
    expect(formatted.division_name).toBe('A');
    expect(formatted.subject_name).toBe('DBMS');
    expect(formatted.status).toBe('ACTIVE');
    expect(formatted.starts_at).toBe('2026-11-23T00:00:00.000Z');
  });
});

describe('AssignmentService Logic', () => {
  it('Normalizes year labels consistently', () => {
    expect(AssignmentService.normalizeYearName('1st Year')).toBe('FE — 1st Year');
    expect(AssignmentService.normalizeYearName('SE')).toBe('SE — 2nd Year');
    expect(AssignmentService.normalizeYearName('3rd Year (TE)')).toBe('TE — 3rd Year');
    expect(AssignmentService.normalizeYearName('BE — 4th Year')).toBe('BE — 4th Year');
    expect(AssignmentService.normalizeYearName('')).toBe('FE — 1st Year');
  });
});
