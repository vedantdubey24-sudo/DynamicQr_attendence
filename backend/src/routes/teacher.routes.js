import { Router } from 'express';
import { TeacherController } from '../controllers/teacher.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireTeacher } from '../middleware/teacher.middleware.js';

const router = Router();

// Protected Teacher Routes
router.use(requireAuth, requireTeacher);

router.get('/profile', TeacherController.getProfile);
router.put('/profile', TeacherController.updateProfile);
router.get('/assignments', TeacherController.getAssignments);

export default router;
