import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// Pre-registration email verification
router.post('/teacher/check-email', AuthController.checkEmail);
router.post('/check-email', AuthController.checkEmail);

// OTP challenges
router.post('/send-otp', authLimiter, AuthController.sendOtp);
router.post('/verify-otp', authLimiter, AuthController.verifyOtp);

// Registration & Login
router.post('/register/teacher', AuthController.registerTeacher);
router.post('/login/code', authLimiter, AuthController.loginWithCode);
router.post('/logout', requireAuth, AuthController.logout);

// Login Code Recovery Flow
router.post('/recovery/send-otp', authLimiter, AuthController.recoverySendOtp);
router.post('/recovery/verify-otp', authLimiter, AuthController.recoveryVerifyOtp);
router.post('/recovery/reset-login-code', authLimiter, AuthController.resetLoginCode);

export default router;
