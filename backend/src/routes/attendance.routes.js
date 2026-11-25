import { Router } from 'express';
import { AttendanceController } from '../controllers/attendance.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireTeacher } from '../middleware/teacher.middleware.js';

const router = Router();

// Protected Attendance Routes (Requires Teacher Role)
router.use(requireAuth, requireTeacher);

router.post('/sessions', AttendanceController.createSession);
router.get('/sessions', AttendanceController.listSessions);
router.get('/sessions/:id', AttendanceController.getSession);
router.get('/sessions/:id/current-qr', AttendanceController.getCurrentQr);
router.post('/sessions/:id/close', AttendanceController.closeSession);

export default router;
