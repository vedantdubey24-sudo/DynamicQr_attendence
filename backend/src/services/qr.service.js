import crypto from 'crypto';
import { prisma } from '../config/database.js';

export class QRTokenService {
  static SESSION_DURATION_SECONDS = 90;
  static TOKEN_ROTATION_SECONDS = 5;

  static async createSession(teacherId, classId, divisionId, subjectId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_SECONDS * 1000);

    const session = await prisma.attendanceSession.create({
      data: {
        teacher_id: teacherId,
        class_id: classId,
        division_id: divisionId,
        subject_id: subjectId,
        status: 'ACTIVE',
        starts_at: now,
        expires_at: expiresAt,
      },
      include: {
        class_rel: true,
        division_rel: true,
        subject_rel: true,
      },
    });

    return session;
  }

  static async generateToken(session) {
    const now = new Date();

    if (session.status !== 'ACTIVE') {
      return null;
    }

    if (now >= new Date(session.expires_at)) {
      await prisma.attendanceSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      return null;
    }

    // Calculate token expiry (5 seconds or remaining session time, whichever is less)
    let tokenExpiry = new Date(now.getTime() + this.TOKEN_ROTATION_SECONDS * 1000);
    const sessionExpiresAt = new Date(session.expires_at);
    if (tokenExpiry > sessionExpiresAt) {
      tokenExpiry = sessionExpiresAt;
    }

    // Generate cryptographically secure random token (32 bytes urlsafe)
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const qrToken = await prisma.qRToken.create({
      data: {
        session_id: session.id,
        token_hash: tokenHash,
        issued_at: now,
        expires_at: tokenExpiry,
        is_revoked: false,
      },
    });

    const remainingSeconds = Math.max(0, Math.floor((sessionExpiresAt.getTime() - now.getTime()) / 1000));

    return {
      token: rawToken,
      token_id: qrToken.id,
      issued_at: now.toISOString(),
      expires_at: tokenExpiry.toISOString(),
      session_expires_at: sessionExpiresAt.toISOString(),
      remaining_seconds: remainingSeconds,
    };
  }

  static async getCurrentToken(session) {
    const now = new Date();

    if (session.status !== 'ACTIVE') {
      return null;
    }

    if (now >= new Date(session.expires_at)) {
      await prisma.attendanceSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      return null;
    }

    // Authority source: generate new raw token for display
    return this.generateToken(session);
  }

  static async closeSession(session) {
    const now = new Date();

    if (session.status !== 'ACTIVE') {
      return false;
    }

    await prisma.$transaction([
      prisma.attendanceSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closed_at: now,
        },
      }),
      prisma.qRToken.updateMany({
        where: {
          session_id: session.id,
          is_revoked: false,
        },
        data: { is_revoked: true },
      }),
    ]);

    return true;
  }

  static async checkAndExpireSession(session) {
    const now = new Date();

    if (session.status === 'ACTIVE' && now >= new Date(session.expires_at)) {
      await prisma.$transaction([
        prisma.attendanceSession.update({
          where: { id: session.id },
          data: { status: 'EXPIRED' },
        }),
        prisma.qRToken.updateMany({
          where: {
            session_id: session.id,
            is_revoked: false,
          },
          data: { is_revoked: true },
        }),
      ]);
      return true;
    }

    return false;
  }

  static formatSessionDict(session) {
    return {
      id: session.id,
      teacher_id: session.teacher_id,
      class_id: session.class_id,
      division_id: session.division_id,
      subject_id: session.subject_id,
      status: session.status,
      starts_at: session.starts_at ? new Date(session.starts_at).toISOString() : null,
      expires_at: session.expires_at ? new Date(session.expires_at).toISOString() : null,
      closed_at: session.closed_at ? new Date(session.closed_at).toISOString() : null,
      class_name: session.class_rel ? session.class_rel.class_name : null,
      division_name: session.division_rel ? session.division_rel.division_name : null,
      subject_name: session.subject_rel ? session.subject_rel.subject_name : null,
      subject_code: session.subject_rel ? session.subject_rel.subject_code : null,
    };
  }
}
