import { prisma } from '../config/database.js';
import { ACADEMIC_YEARS } from '../constants/catalogue.js';

export class AssignmentService {
  static normalizeYearName(rawYear) {
    if (!rawYear) return 'FE — 1st Year';
    const raw = rawYear.trim();

    for (const y of ACADEMIC_YEARS) {
      if (y.toLowerCase() === raw.toLowerCase()) return y;
      const prefix = y.split('—')[0].trim();
      if (raw.toLowerCase().includes(prefix.toLowerCase())) return y;
      const suffix = y.includes('—') ? y.split('—')[1].trim() : '';
      if (suffix && raw.toLowerCase().includes(suffix.toLowerCase())) return y;
    }
    return raw;
  }

  static async saveTeacherAssignments(teacherId, assignmentsData) {
    if (!assignmentsData || !Array.isArray(assignmentsData)) return [];

    // Find or create default academic year
    let academicYear = await prisma.academicYear.findFirst({
      where: { year_name: '2025-2026' },
    });

    if (!academicYear) {
      academicYear = await prisma.academicYear.create({
        data: { year_name: '2025-2026', is_active: true },
      });
    }

    // Delete existing assignments for this teacher
    await prisma.teacherAssignment.deleteMany({
      where: { teacher_id: teacherId },
    });

    const createdAssignments = [];
    const addedCombinations = new Set();

    for (const item of assignmentsData) {
      const rawYear = item.academicYear || item.academic_year || item.year || '';
      const subjectName = (item.subject || item.subject_name || '').trim();
      const divisions = item.divisions || [];

      if (!rawYear || !subjectName || !divisions.length) continue;

      const yearName = this.normalizeYearName(rawYear);

      // Find or create Class
      let classObj = await prisma.class.findFirst({
        where: { class_name: yearName, academic_year_id: academicYear.id },
      });
      if (!classObj) {
        classObj = await prisma.class.create({
          data: { class_name: yearName, academic_year_id: academicYear.id },
        });
      }

      // Find or create Subject
      let subjObj = await prisma.subject.findFirst({
        where: { subject_name: subjectName },
      });
      if (!subjObj) {
        const codePrefix = yearName.slice(0, 2);
        subjObj = await prisma.subject.create({
          data: {
            subject_name: subjectName,
            subject_code: `${codePrefix}-${subjectName.length}`,
          },
        });
      }

      for (const divNameRaw of divisions) {
        const divName = String(divNameRaw).trim().toUpperCase();
        if (!divName) continue;

        let divObj = await prisma.division.findFirst({
          where: { division_name: divName, class_id: classObj.id },
        });
        if (!divObj) {
          divObj = await prisma.division.create({
            data: { division_name: divName, class_id: classObj.id },
          });
        }

        const comboKey = `${classObj.id}-${divObj.id}-${subjObj.id}`;
        if (addedCombinations.has(comboKey)) continue;
        addedCombinations.add(comboKey);

        const assignment = await prisma.teacherAssignment.create({
          data: {
            teacher_id: teacherId,
            class_id: classObj.id,
            division_id: divObj.id,
            subject_id: subjObj.id,
          },
          include: {
            class_rel: true,
            division_rel: true,
            subject_rel: true,
          },
        });

        createdAssignments.push(assignment);
      }
    }

    return createdAssignments;
  }

  static async getGroupedTeachingAssignments(teacherId) {
    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacher_id: teacherId },
      include: {
        class_rel: true,
        division_rel: true,
        subject_rel: true,
      },
    });

    const grouped = {};

    for (const a of assignments) {
      const yearName = a.class_rel?.class_name || 'FE — 1st Year';
      const subjectName = a.subject_rel?.subject_name || 'Subject';
      const divName = a.division_rel?.division_name || 'A';

      const key = `${yearName}__${subjectName}`;
      if (!grouped[key]) {
        grouped[key] = {
          year: yearName,
          academicYear: yearName,
          subject: subjectName,
          subject_code: a.subject_rel?.subject_code || '',
          divisions: [],
        };
      }
      if (!grouped[key].divisions.includes(divName)) {
        grouped[key].divisions.push(divName);
      }
    }

    for (const g of Object.values(grouped)) {
      g.divisions.sort();
    }

    return Object.values(grouped);
  }
}
