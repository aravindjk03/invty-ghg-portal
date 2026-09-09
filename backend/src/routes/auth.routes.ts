import { Router } from 'express';
import { authController } from '../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/signup - Register new account in SQLite database
router.post('/signup', authController.signup);

// POST /api/v1/auth/login - Authenticate with email & password against SQLite database
router.post('/login', authController.login);

// POST /api/v1/auth/google - Official Google Sign-In & Verification
router.post('/google', authController.googleAuth);

// POST /api/v1/auth/mobile/send-otp - Dispatch 6-digit numeric OTP
router.post('/mobile/send-otp', authController.sendMobileOtp);

// POST /api/v1/auth/mobile/verify-otp - Verify 6-digit OTP & sign in
router.post('/mobile/verify-otp', authController.verifyMobileOtp);

// GET /api/v1/auth/me - Validate current session token
router.get('/me', authController.me);

// POST /api/v1/auth/logout - Invalidate session
router.post('/logout', authController.logout);

// GET /api/v1/auth/demo-accounts - Helper for demonstration / testing
router.get('/demo-accounts', authController.getDemoAccounts);

export default router;
