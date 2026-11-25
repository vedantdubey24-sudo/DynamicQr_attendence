import { prisma } from '../config/database.js';
import { QRTokenService } from '../services/qr.service.js';
import { logAuditEvent } from '../utils/audit.utils.js';

export class AttendanceController {
  // POST /api/attendance/sessions
  static async createSession(req, res, next) {
    try {
      const teacher = req.teacher;
      const classId = parseInt(req.body?.class_id, 10);
      const divisionId = parseInt(req.body?.division_id, 10);
      const subjectId = parseInt(req.body?.subject_id, 10);

      if (!classId || !divisionId || !subjectId) {
        return res.status(400).json({
          error: 'class_id, division_id, and subject_id are required',
        });
      }

      // Verify teacher has this assignment
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacher_id: teacher.id,
          class_id: classId,
          division_id: divisionId,
          subject_id: subjectId,
        },
      });

      if (!assignment) {
        return res.status(403).json({
          error: 'You are not assigned to this class/division/subject combination',
        });
      }

      // Check for existing active session
      const active = await prisma.attendanceSession.findFirst({
        where: {
          teacher_id: teacher.id,
          status: 'ACTIVE',
        },
      });

      if (active) {
        const now = new Date();
        if (now >= new Date(active.expires_at)) {
          await prisma.attendanceSession.update({
            where: { id: active.id },
            data: { status: 'EXPIRED' },
          });
        } else {
          return res.status(409).json({
            error: 'You already have an active session. Close it before starting a new one.',
            active_session_id: active.id,
          });
        }
      }

      // Create session
      const session = await QRTokenService.createSession(
        teacher.id,
        classId,
        divisionId,
        subjectId
      );

      await logAuditEvent('SESSION_CREATED', teacher.id, req.ip, {
        session_id: session.id,
      });

      // Generate the first QR token
      const tokenData = await QRTokenService.generateToken(session);

      return res.status(201).json({
        message: 'Attendance session started',
        session: QRTokenService.formatSessionDict(session),
        qr: tokenData,
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/attendance/sessions
  static async listSessions(req, res, next) {
    try {
      const teacher = req.teacher;
      const sessions = await prisma.attendanceSession.findMany({
        where: { teacher_id: teacher.id },
        orderBy: { starts_at: 'desc' },
        take: 20,
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      const now = new Date();
      const formattedSessions = [];

      for (const s of sessions) {
        if (s.status === 'ACTIVE' && now >= new Date(s.expires_at)) {
          await prisma.attendanceSession.update({
            where: { id: s.id },
            data: { status: 'EXPIRED' },
          });
          s.status = 'EXPIRED';
        }
        formattedSessions.push(QRTokenService.formatSessionDict(s));
      }

      return res.status(200).json({ sessions: formattedSessions });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/attendance/sessions/:id
  static async getSession(req, res, next) {
    try {
      const teacher = req.teacher;
      const sessionId = parseInt(req.params.id, 10);

      const session = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.teacher_id !== teacher.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await QRTokenService.checkAndExpireSession(session);

      const updated = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      return res.status(200).json({
        session: QRTokenService.formatSessionDict(updated),
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/attendance/sessions/:id/current-qr
  static async getCurrentQr(req, res, next) {
    try {
      const teacher = req.teacher;
      const sessionId = parseInt(req.params.id, 10);

      const session = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.teacher_id !== teacher.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check and auto-expire
      await QRTokenService.checkAndExpireSession(session);

      const currentSession = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      if (currentSession.status !== 'ACTIVE') {
        return res.status(410).json({
          error: 'Session is no longer active',
          status: currentSession.status,
          session: QRTokenService.formatSessionDict(currentSession),
        });
      }

      const tokenData = await QRTokenService.generateToken(currentSession);
      if (!tokenData) {
        return res.status(410).json({
          error: 'Session has expired',
          status: currentSession.status,
          session: QRTokenService.formatSessionDict(currentSession),
        });
      }

      return res.status(200).json({
        qr: tokenData,
        session: QRTokenService.formatSessionDict(currentSession),
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/attendance/sessions/:id/close
  static async closeSession(req, res, next) {
    try {
      const teacher = req.teacher;
      const sessionId = parseInt(req.params.id, 10);

      const session = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.teacher_id !== teacher.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (session.status !== 'ACTIVE') {
        return res.status(400).json({ error: `Session is already ${session.status}` });
      }

      await QRTokenService.closeSession(session);

      const closedSession = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      await logAuditEvent('SESSION_CLOSED', teacher.id, req.ip, {
        session_id: session.id,
      });

      return res.status(200).json({
        message: 'Session closed',
        session: QRTokenService.formatSessionDict(closedSession),
      });
    } catch (err) {
      next(err);
    }
  }
}
