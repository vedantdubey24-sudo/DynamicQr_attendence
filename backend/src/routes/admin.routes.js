import { Router } from 'express';
import multer from 'multer';
import { AdminController } from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public Admin Login
router.post('/login', authLimiter, AdminController.login);

// Protected Admin Routes
router.use(requireAuth, requireAdmin);

// Allowlist management
router.get('/approved-teacher-emails', AdminController.listApprovedEmails);
router.post('/approved-teacher-emails', AdminController.addApprovedEmail);
router.post('/approved-teacher-emails/csv', upload.single('file'), AdminController.uploadCsv);
router.patch('/approved-teacher-emails/:entry_id', AdminController.updateApprovedEmail);
router.delete('/approved-teacher-emails/:entry_id', AdminController.deleteApprovedEmail);

// Faculty approvals & status
router.get('/teachers/pending', AdminController.listPendingTeachers);

router.post('/teachers/:id/approve', AdminController.approveTeacher);
router.patch('/teachers/:id/approve', AdminController.approveTeacher);
router.post('/faculty/:id/approve', AdminController.approveTeacher);
router.patch('/faculty/:id/approve', AdminController.approveTeacher);

router.post('/teachers/:id/reject', AdminController.rejectTeacher);
router.patch('/teachers/:id/reject', AdminController.rejectTeacher);
router.post('/faculty/:id/reject', AdminController.rejectTeacher);
router.patch('/faculty/:id/reject', AdminController.rejectTeacher);

// Departments
router.get('/departments', AdminController.listDepartments);
router.post('/faculty/:id/department', AdminController.updateFacultyDepartment);
router.patch('/faculty/:id/department', AdminController.updateFacultyDepartment);
router.post('/teachers/:id/department', AdminController.updateFacultyDepartment);
router.patch('/teachers/:id/department', AdminController.updateFacultyDepartment);

// Faculty status
router.post('/faculty/:id/status', AdminController.updateFacultyStatus);
router.patch('/faculty/:id/status', AdminController.updateFacultyStatus);
router.post('/teachers/:id/status', AdminController.updateFacultyStatus);
router.patch('/teachers/:id/status', AdminController.updateFacultyStatus);

// Assignments
router.post('/teachers/:id/assignments', AdminController.addAssignment);
router.delete('/teachers/:id/assignments/:aid', AdminController.removeAssignment);

// Academic catalogue
router.get('/academic-years', AdminController.listAcademicYears);
router.get('/classes', AdminController.listClasses);
router.get('/divisions', AdminController.listDivisions);
router.get('/subjects', AdminController.listSubjects);

export default router;
