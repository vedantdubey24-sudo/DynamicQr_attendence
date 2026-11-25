import { prisma } from '../config/database.js';
import { AssignmentService } from '../services/assignment.service.js';
import { logAuditEvent } from '../utils/audit.utils.js';
import { DEPARTMENTS, DESIGNATIONS } from '../constants/catalogue.js';

export class TeacherController {
  // GET /api/teacher/profile
  static async getProfile(req, res, next) {
    try {
      const teacher = req.teacher;
      const profile = await prisma.teacherProfile.findUnique({
        where: { user_id: teacher.id },
        include: { department_rel: true },
      });

      const teachingAssignments = await AssignmentService.getGroupedTeachingAssignments(teacher.id);
      const flatAssignments = await prisma.teacherAssignment.findMany({
        where: { teacher_id: teacher.id },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      const deptName = profile?.department_rel?.name || profile?.department || null;

      const data = {
        id: teacher.id,
        email: teacher.email,
        role: teacher.role,
        status: teacher.status,
        created_at: teacher.created_at ? teacher.created_at.toISOString() : null,
        full_name: profile?.full_name || null,
        staff_id: profile?.staff_id || null,
        erp_id: profile?.staff_id || null,
        department: deptName,
        department_id: profile?.department_id || null,
        designation: profile?.designation || null,
        profile: profile
          ? {
              id: profile.id,
              user_id: profile.user_id,
              full_name: profile.full_name,
              department: deptName,
              department_id: profile.department_id,
              designation: profile.designation,
              staff_id: profile.staff_id,
              erp_id: profile.staff_id,
            }
          : null,
        teaching_assignments: teachingAssignments,
        assignments: flatAssignments.map((a) => ({
          id: a.id,
          teacher_id: a.teacher_id,
          class_id: a.class_id,
          division_id: a.division_id,
          subject_id: a.subject_id,
          class_name: a.class_rel?.class_name,
          division_name: a.division_rel?.division_name,
          subject_name: a.subject_rel?.subject_name,
          subject_code: a.subject_rel?.subject_code,
        })),
      };

      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  // PUT /api/teacher/profile
  static async updateProfile(req, res, next) {
    try {
      const teacher = req.teacher;
      const data = req.body || {};

      let profile = await prisma.teacherProfile.findUnique({
        where: { user_id: teacher.id },
      });

      if (!profile) {
        profile = await prisma.teacherProfile.create({
          data: {
            user_id: teacher.id,
            full_name: 'Faculty',
            department: DEPARTMENTS[0],
            designation: DESIGNATIONS[0],
            staff_id: `STAFF-${teacher.id}`,
          },
        });
      }

      const updateData = {};

      if (data.department) {
        const deptStr = String(data.department).trim();
        let dept = await prisma.department.findFirst({
          where: { name: { equals: deptStr, mode: 'insensitive' } },
        });
        if (dept) {
          updateData.department = dept.name;
          updateData.department_id = dept.id;
        } else if (DEPARTMENTS.includes(deptStr)) {
          updateData.department = deptStr;
        }
      }

      if (data.designation) {
        updateData.designation = String(data.designation).trim();
      }

      if (data.full_name && String(data.full_name).trim()) {
        updateData.full_name = String(data.full_name).trim();
      }

      if (Object.keys(updateData).length > 0) {
        profile = await prisma.teacherProfile.update({
          where: { id: profile.id },
          data: updateData,
          include: { department_rel: true },
        });
      }

      // Update teaching assignments if provided
      const assignmentsData = data.teaching_assignments;
      if (assignmentsData !== undefined) {
        if (!Array.isArray(assignmentsData)) {
          return res.status(400).json({ error: 'teaching_assignments must be a list' });
        }

        for (const a of assignmentsData) {
          if (!a.subject || !a.divisions || !a.divisions.length) {
            return res.status(400).json({
              error: 'Each course assignment must specify a subject and at least one division.',
            });
          }
        }

        try {
          await AssignmentService.saveTeacherAssignments(teacher.id, assignmentsData);
        } catch (e) {
          return res.status(500).json({ error: 'Failed to save course assignments' });
        }
      }

      await logAuditEvent('TEACHER_PROFILE_UPDATED', teacher.id, req.ip, {
        email: teacher.email,
      });

      const teachingAssignments = await AssignmentService.getGroupedTeachingAssignments(teacher.id);
      const flatAssignments = await prisma.teacherAssignment.findMany({
        where: { teacher_id: teacher.id },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      const deptName = profile?.department_rel?.name || profile?.department || null;

      return res.status(200).json({
        id: teacher.id,
        email: teacher.email,
        role: teacher.role,
        status: teacher.status,
        created_at: teacher.created_at ? teacher.created_at.toISOString() : null,
        full_name: profile.full_name,
        staff_id: profile.staff_id,
        erp_id: profile.staff_id,
        department: deptName,
        department_id: profile.department_id,
        designation: profile.designation,
        profile: {
          id: profile.id,
          user_id: profile.user_id,
          full_name: profile.full_name,
          department: deptName,
          department_id: profile.department_id,
          designation: profile.designation,
          staff_id: profile.staff_id,
          erp_id: profile.staff_id,
        },
        teaching_assignments: teachingAssignments,
        assignments: flatAssignments.map((a) => ({
          id: a.id,
          teacher_id: a.teacher_id,
          class_id: a.class_id,
          division_id: a.division_id,
          subject_id: a.subject_id,
          class_name: a.class_rel?.class_name,
          division_name: a.division_rel?.division_name,
          subject_name: a.subject_rel?.subject_name,
          subject_code: a.subject_rel?.subject_code,
        })),
        message: 'Profile and teaching courses updated successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/teacher/assignments
  static async getAssignments(req, res, next) {
    try {
      const teacher = req.teacher;
      const flatAssignments = await prisma.teacherAssignment.findMany({
        where: { teacher_id: teacher.id },
        include: {
          class_rel: true,
          division_rel: true,
          subject_rel: true,
        },
      });

      const grouped = await AssignmentService.getGroupedTeachingAssignments(teacher.id);

      return res.status(200).json({
        assignments: flatAssignments.map((a) => ({
          id: a.id,
          teacher_id: a.teacher_id,
          class_id: a.class_id,
          division_id: a.division_id,
          subject_id: a.subject_id,
          class_name: a.class_rel?.class_name,
          division_name: a.division_rel?.division_name,
          subject_name: a.subject_rel?.subject_name,
          subject_code: a.subject_rel?.subject_code,
        })),
        teaching_assignments: grouped,
      });
    } catch (err) {
      next(err);
    }
  }
}
