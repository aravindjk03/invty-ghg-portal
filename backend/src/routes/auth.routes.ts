import { Router } from 'express';
import { authController } from '../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/signup - Register new account in SQLite database
router.post('/signup', authController.signup);

// POST /api/v1/auth/login - Authenticate with email & password against SQLite database
router.post('/login', authController.login);

// POST /api/v1/auth/oauth-mock - SSO Mock for Google & Apple
router.post('/oauth-mock', authController.oauthMock);

// GET /api/v1/auth/me - Validate current session token
router.get('/me', authController.me);

// POST /api/v1/auth/logout - Invalidate session
router.post('/logout', authController.logout);

// GET /api/v1/auth/demo-accounts - Helper for demonstration / testing
router.get('/demo-accounts', authController.getDemoAccounts);

export default router;
