import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';
import { AssignmentService } from '../services/assignment.service.js';
import { EmailService } from '../services/email.service.js';
import { logAuditEvent } from '../utils/audit.utils.js';
import { verifyPasswordOrCode, hashPasswordOrCode } from '../utils/hash.utils.js';
import { DEPARTMENTS } from '../constants/catalogue.js';

export class AdminController {
  // POST /api/admin/login
  static async login(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      const password = req.body?.password || '';

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await prisma.user.findFirst({
        where: { email, role: 'ADMIN' },
      });

      if (!user || !user.password_hash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const { match, needsRehash } = await verifyPasswordOrCode(password, user.password_hash);
      if (!match) {
        await logAuditEvent('ADMIN_LOGIN_FAILED', null, req.ip, { email });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Gradual background rehash to bcrypt if legacy Werkzeug hash was used
      if (needsRehash) {
        try {
          const newBcryptHash = await hashPasswordOrCode(password);
          await prisma.user.update({
            where: { id: user.id },
            data: { password_hash: newBcryptHash },
          });
        } catch (rehashErr) {
          console.warn('Rehash to bcrypt failed:', rehashErr.message);
        }
      }

      const token = jwt.sign(
        {
          sub: String(user.id),
          role: 'ADMIN',
          email: user.email,
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      await logAuditEvent('ADMIN_LOGIN_SUCCESS', user.id, req.ip);

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

  // POST /api/admin/approved-teacher-emails
  static async addApprovedEmail(req, res, next) {
    try {
      const email = (req.body?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address required' });
      }

      const existing = await prisma.approvedTeacherEmail.findUnique({
        where: { email },
      });
      if (existing) {
        return res.status(409).json({ error: 'Email already in the approved list' });
      }

      const adminId = parseInt(req.user.sub, 10);
      const entry = await prisma.approvedTeacherEmail.create({
        data: {
          email,
          is_used: false,
          created_by: adminId,
        },
      });

      await logAuditEvent('APPROVED_EMAIL_ADDED', adminId, req.ip, { email });

      return res.status(201).json({
        message: 'Email approved successfully',
        entry: {
          id: entry.id,
          email: entry.email,
          is_used: entry.is_used,
          created_at: entry.created_at.toISOString(),
          used_at: entry.used_at ? entry.used_at.toISOString() : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/admin/approved-teacher-emails/csv
  static async uploadCsv(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'CSV file required' });
      }

      const content = req.file.buffer.toString('utf-8');
      const lines = content.split(/\r?\n/);

      const added = [];
      const skipped = [];
      const adminId = parseInt(req.user.sub, 10);

      for (const line of lines) {
        if (!line.trim()) continue;
        const row = line.split(',');
        const email = (row[0] || '').trim().toLowerCase();

        if (!email || !email.includes('@')) {
          skipped.push({ email, reason: 'Invalid email' });
          continue;
        }

        const existing = await prisma.approvedTeacherEmail.findUnique({
          where: { email },
        });

        if (existing) {
          skipped.push({ email, reason: 'Already exists' });
          continue;
        }

        await prisma.approvedTeacherEmail.create({
          data: {
            email,
            is_used: false,
            created_by: adminId,
          },
        });
        added.push(email);
      }

      await logAuditEvent('APPROVED_EMAILS_CSV_UPLOADED', adminId, req.ip, {
        added_count: added.length,
        skipped_count: skipped.length,
      });

      return res.status(201).json({
        message: `${added.length} email(s) added, ${skipped.length} skipped`,
        added,
        skipped,
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/approved-teacher-emails
  static async listApprovedEmails(req, res, next) {
    try {
      const entries = await prisma.approvedTeacherEmail.findMany({
        orderBy: { created_at: 'desc' },
      });

      return res.status(200).json({
        entries: entries.map((e) => ({
          id: e.id,
          email: e.email,
          is_used: e.is_used,
          created_at: e.created_at.toISOString(),
          used_at: e.used_at ? e.used_at.toISOString() : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  // PATCH /api/admin/approved-teacher-emails/:entry_id
  static async updateApprovedEmail(req, res, next) {
    try {
      const entryId = parseInt(req.params.entry_id, 10);
      const entry = await prisma.approvedTeacherEmail.findUnique({
        where: { id: entryId },
      });

      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      const newEmail = (req.body?.email || '').trim().toLowerCase();
      let updatedEntry = entry;

      if (newEmail && !entry.is_used) {
        updatedEntry = await prisma.approvedTeacherEmail.update({
          where: { id: entryId },
          data: { email: newEmail },
        });
      }

      return res.status(200).json({
        entry: {
          id: updatedEntry.id,
          email: updatedEntry.email,
          is_used: updatedEntry.is_used,
          created_at: updatedEntry.created_at.toISOString(),
          used_at: updatedEntry.used_at ? updatedEntry.used_at.toISOString() : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // DELETE /api/admin/approved-teacher-emails/:entry_id
  static async deleteApprovedEmail(req, res, next) {
    try {
      const entryId = parseInt(req.params.entry_id, 10);
      const entry = await prisma.approvedTeacherEmail.findUnique({
        where: { id: entryId },
      });

      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      const targetEmail = entry.email;
      const teacherUser = await prisma.user.findFirst({
        where: { email: targetEmail },
      });

      if (teacherUser) {
        // Atomic cascade cleanup of teacher dependencies matching Flask backend
        await prisma.$transaction(async (tx) => {
          const sessions = await tx.attendanceSession.findMany({
            where: { teacher_id: teacherUser.id },
            select: { id: true },
          });

          const sessionIds = sessions.map((s) => s.id);
          if (sessionIds.length > 0) {
            await tx.qRToken.deleteMany({
              where: { session_id: { in: sessionIds } },
            });
            await tx.attendanceSession.deleteMany({
              where: { teacher_id: teacherUser.id },
            });
          }

          await tx.recoveryAuthorization.deleteMany({ where: { user_id: teacherUser.id } });
          await tx.loginCodeCredential.deleteMany({ where: { user_id: teacherUser.id } });
          await tx.teacherAssignment.deleteMany({ where: { teacher_id: teacherUser.id } });
          await tx.teacherProfile.deleteMany({ where: { user_id: teacherUser.id } });
          await tx.user.delete({ where: { id: teacherUser.id } });
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.oTPChallenge.deleteMany({ where: { email: targetEmail } });
        await tx.approvedTeacherEmail.delete({ where: { id: entryId } });
      });

      const adminId = parseInt(req.user.sub, 10);
      await logAuditEvent('APPROVED_EMAIL_DELETED', adminId, req.ip, {
        email: targetEmail,
        account_deleted: Boolean(teacherUser),
      });

      return res.status(200).json({
        message: `Email ${targetEmail} successfully removed from allowlist`,
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/teachers/pending
  static async listPendingTeachers(req, res, next) {
    try {
      const statusFilter = req.query.status || 'PENDING';

      const teachers = await prisma.user.findMany({
        where: { role: 'TEACHER', status: statusFilter },
        include: {
          profile: {
            include: { department_rel: true },
          },
        },
      });

      const result = [];
      for (const t of teachers) {
        const teachingAssignments = await AssignmentService.getGroupedTeachingAssignments(t.id);
        const deptName = t.profile?.department_rel?.name || t.profile?.department || null;

        result.push({
          id: t.id,
          email: t.email,
          role: t.role,
          status: t.status,
          created_at: t.created_at.toISOString(),
          profile: t.profile
            ? {
                id: t.profile.id,
                user_id: t.profile.user_id,
                full_name: t.profile.full_name,
                department: deptName,
                department_id: t.profile.department_id,
                designation: t.profile.designation,
                staff_id: t.profile.staff_id,
                erp_id: t.profile.staff_id,
              }
            : null,
          teaching_assignments: teachingAssignments,
        });
      }

      return res.status(200).json({ teachers: result });
    } catch (err) {
      next(err);
    }
  }

  // POST or PATCH /api/admin/teachers/:id/approve and /api/admin/faculty/:id/approve
  static async approveTeacher(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const teacher = await prisma.user.findFirst({
        where: { id: teacherId, role: 'TEACHER' },
      });

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      if (teacher.status !== 'PENDING') {
        return res.status(400).json({ error: `Teacher is already ${teacher.status}` });
      }

      const updated = await prisma.user.update({
        where: { id: teacherId },
        data: { status: 'APPROVED' },
      });

      // Save explicit assignments if passed
      const assignmentsData = req.body?.teaching_assignments || req.body?.assignments;
      if (assignmentsData && assignmentsData.length > 0) {
        await AssignmentService.saveTeacherAssignments(teacherId, assignmentsData);
      }

      const adminId = parseInt(req.user.sub, 10);
      await logAuditEvent('TEACHER_APPROVED', adminId, req.ip, { teacher_id: teacherId });

      // Send approval notification email
      await EmailService.sendApprovalEmail(teacher.email);

      return res.status(200).json({
        message: 'Teacher approved successfully',
        teacher: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          status: updated.status,
          created_at: updated.created_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST or PATCH /api/admin/teachers/:id/reject and /api/admin/faculty/:id/reject
  static async rejectTeacher(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const teacher = await prisma.user.findFirst({
        where: { id: teacherId, role: 'TEACHER' },
      });

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      if (teacher.status !== 'PENDING') {
        return res.status(400).json({ error: `Teacher cannot be rejected in ${teacher.status} status` });
      }

      await prisma.user.update({
        where: { id: teacherId },
        data: { status: 'REJECTED' },
      });

      const adminId = parseInt(req.user.sub, 10);
      await logAuditEvent('TEACHER_REJECTED', adminId, req.ip, { teacher_id: teacherId });

      return res.status(200).json({ message: 'Teacher rejected' });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/departments
  static async listDepartments(req, res, next) {
    try {
      // Seed official departments if table is empty
      const count = await prisma.department.count();
      if (count === 0) {
        for (const deptName of DEPARTMENTS) {
          await prisma.department.upsert({
            where: { name: deptName },
            update: {},
            create: { name: deptName },
          });
        }
      }

      const departments = await prisma.department.findMany({
        orderBy: { id: 'asc' },
      });

      return res.status(200).json({
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  // POST or PATCH /api/admin/faculty/:id/department
  static async updateFacultyDepartment(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const teacher = await prisma.user.findFirst({
        where: { id: teacherId, role: 'TEACHER' },
        include: { profile: true },
      });

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const deptNameInput = (req.body?.department || '').trim();
      const deptIdInput = req.body?.department_id;

      let dept = null;
      if (deptIdInput) {
        dept = await prisma.department.findUnique({
          where: { id: parseInt(deptIdInput, 10) },
        });
      } else if (deptNameInput) {
        let matchedName = null;
        for (const dName of DEPARTMENTS) {
          if (dName.toLowerCase() === deptNameInput.toLowerCase()) {
            matchedName = dName;
            break;
          }
        }
        if (matchedName) {
          dept = await prisma.department.findUnique({ where: { name: matchedName } });
          if (!dept) {
            dept = await prisma.department.create({ data: { name: matchedName } });
          }
        }
      }

      if (!dept) {
        return res.status(400).json({
          error: 'Invalid department specified. Must match one of the 9 official departments.',
        });
      }

      let profile = teacher.profile;
      if (!profile) {
        profile = await prisma.teacherProfile.create({
          data: {
            user_id: teacher.id,
            full_name: 'Faculty',
            department: dept.name,
            department_id: dept.id,
            designation: 'Assistant Professor',
            staff_id: `STAFF-${teacher.id}`,
          },
        });
      } else {
        profile = await prisma.teacherProfile.update({
          where: { id: profile.id },
          data: {
            department: dept.name,
            department_id: dept.id,
          },
        });
      }

      const adminId = parseInt(req.user.sub, 10);
      await logAuditEvent('FACULTY_DEPARTMENT_UPDATED', adminId, req.ip, {
        teacher_id: teacherId,
        new_department: dept.name,
      });

      const teachingAssignments = await AssignmentService.getGroupedTeachingAssignments(teacher.id);

      return res.status(200).json({
        message: `Department successfully updated to ${dept.name}`,
        teacher: {
          id: teacher.id,
          email: teacher.email,
          role: teacher.role,
          status: teacher.status,
          profile: {
            id: profile.id,
            full_name: profile.full_name,
            department: dept.name,
            department_id: dept.id,
            designation: profile.designation,
            staff_id: profile.staff_id,
            erp_id: profile.staff_id,
          },
          teaching_assignments: teachingAssignments,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST or PATCH /api/admin/faculty/:id/status
  static async updateFacultyStatus(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const teacher = await prisma.user.findFirst({
        where: { id: teacherId, role: 'TEACHER' },
      });

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const newStatus = (req.body?.status || '').trim().toUpperCase();
      if (!['APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING'].includes(newStatus)) {
        return res.status(400).json({
          error: 'Invalid status. Allowed values: APPROVED, SUSPENDED, REJECTED, PENDING',
        });
      }

      const updated = await prisma.user.update({
        where: { id: teacherId },
        data: { status: newStatus },
      });

      const adminId = parseInt(req.user.sub, 10);
      await logAuditEvent('TEACHER_STATUS_UPDATED', adminId, req.ip, {
        teacher_id: teacherId,
        old_status: teacher.status,
        new_status: newStatus,
      });

      return res.status(200).json({
        message: `Faculty status updated to ${newStatus}`,
        teacher: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          status: updated.status,
          created_at: updated.created_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/admin/teachers/:id/assignments
  static async addAssignment(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const { class_id, division_id, subject_id } = req.body;

      if (!class_id || !division_id || !subject_id) {
        return res.status(400).json({ error: 'class_id, division_id, and subject_id are required' });
      }

      const teacher = await prisma.user.findFirst({
        where: { id: teacherId, role: 'TEACHER' },
      });
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Check existence
      const [classExists, divisionExists, subjectExists] = await Promise.all([
        prisma.class.findUnique({ where: { id: class_id } }),
        prisma.division.findUnique({ where: { id: division_id } }),
        prisma.subject.findUnique({ where: { id: subject_id } }),
      ]);

      if (!classExists) return res.status(404).json({ error: 'Class not found' });
      if (!divisionExists) return res.status(404).json({ error: 'Division not found' });
      if (!subjectExists) return res.status(404).json({ error: 'Subject not found' });

      const existing = await prisma.teacherAssignment.findFirst({
        where: {
          teacher_id: teacherId,
          class_id,
          division_id,
          subject_id,
        },
      });
      if (existing) {
        return res.status(409).json({ error: 'Assignment already exists' });
      }

      const assignment = await prisma.teacherAssignment.create({
        data: {
          teacher_id: teacherId,
          class_id,
          division_id,
          subject_id,
        },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      return res.status(201).json({
        message: 'Assignment added',
        assignment: {
          id: assignment.id,
          teacher_id: assignment.teacher_id,
          class_id: assignment.class_id,
          division_id: assignment.division_id,
          subject_id: assignment.subject_id,
          class_name: assignment.class_rel?.class_name,
          division_name: assignment.division_rel?.division_name,
          subject_name: assignment.subject_rel?.subject_name,
          subject_code: assignment.subject_rel?.subject_code,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // DELETE /api/admin/teachers/:id/assignments/:aid
  static async removeAssignment(req, res, next) {
    try {
      const teacherId = parseInt(req.params.id || req.params.teacher_id, 10);
      const assignmentId = parseInt(req.params.aid || req.params.assignment_id, 10);

      const assignment = await prisma.teacherAssignment.findFirst({
        where: { id: assignmentId, teacher_id: teacherId },
      });

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      await prisma.teacherAssignment.delete({ where: { id: assignmentId } });

      return res.status(200).json({ message: 'Assignment removed' });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/academic-years
  static async listAcademicYears(req, res, next) {
    try {
      const years = await prisma.academicYear.findMany({
        where: { is_active: true },
      });
      return res.status(200).json({
        academic_years: years.map((y) => ({
          id: y.id,
          year_name: y.year_name,
          is_active: y.is_active,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/classes
  static async listClasses(req, res, next) {
    try {
      const yearId = req.query.academic_year_id ? parseInt(req.query.academic_year_id, 10) : undefined;
      const classes = await prisma.class.findMany({
        where: yearId ? { academic_year_id: yearId } : undefined,
        include: { academic_year: true },
      });

      return res.status(200).json({
        classes: classes.map((c) => ({
          id: c.id,
          class_name: c.class_name,
          academic_year_id: c.academic_year_id,
          academic_year: c.academic_year?.year_name,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/divisions
  static async listDivisions(req, res, next) {
    try {
      const classId = req.query.class_id ? parseInt(req.query.class_id, 10) : undefined;
      const divisions = await prisma.division.findMany({
        where: classId ? { class_id: classId } : undefined,
        include: { class_: true },
      });

      return res.status(200).json({
        divisions: divisions.map((d) => ({
          id: d.id,
          division_name: d.division_name,
          class_id: d.class_id,
          class_name: d.class_?.class_name,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/admin/subjects
  static async listSubjects(req, res, next) {
    try {
      const subjects = await prisma.subject.findMany();
      return res.status(200).json({
        subjects: subjects.map((s) => ({
          id: s.id,
          subject_name: s.subject_name,
          subject_code: s.subject_code,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
}
