import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from './src/config/database.js';
import { DEPARTMENTS, COURSE_CATALOGUE, AVAILABLE_DIVISIONS } from './src/constants/catalogue.js';

async function seed() {
  console.log('🌱 Starting database seeding (Admin, Departments & Catalogue)...');

  // 1. Seed official departments
  console.log('📌 Seeding departments...');
  for (const deptName of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name: deptName },
      update: {},
      create: { name: deptName },
    });
  }

  // 2. Seed Academic Year & Catalogue
  console.log('📌 Seeding academic years, classes, divisions, and subjects...');
  let academicYear = await prisma.academicYear.findFirst({
    where: { year_name: '2025-2026' },
  });

  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: { year_name: '2025-2026', is_active: true },
    });
  }

  for (const [className, subjects] of Object.entries(COURSE_CATALOGUE)) {
    let classObj = await prisma.class.findFirst({
      where: { class_name: className, academic_year_id: academicYear.id },
    });
    if (!classObj) {
      classObj = await prisma.class.create({
        data: { class_name: className, academic_year_id: academicYear.id },
      });
    }

    // Divisions
    for (const divName of AVAILABLE_DIVISIONS) {
      const existingDiv = await prisma.division.findFirst({
        where: { division_name: divName, class_id: classObj.id },
      });
      if (!existingDiv) {
        await prisma.division.create({
          data: { division_name: divName, class_id: classObj.id },
        });
      }
    }

    // Subjects
    for (const subjectName of subjects) {
      const codePrefix = className.slice(0, 2);
      const subjectCode = `${codePrefix}-${subjectName.length}`;
      await prisma.subject.upsert({
        where: { subject_code: subjectCode },
        update: {},
        create: {
          subject_name: subjectName,
          subject_code: subjectCode,
        },
      });
    }
  }

  // 3. Seed Admin account
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@institution.edu').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail, role: 'ADMIN' },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        role: 'ADMIN',
        password_hash: passwordHash,
        status: 'APPROVED',
      },
    });
    console.log(`✅ Admin account created: ${adminEmail}`);
  } else {
    console.log(`ℹ️ Admin account already exists: ${adminEmail}`);
  }

  console.log('✅ Seeding completed successfully!');
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error('❌ Seeding failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
