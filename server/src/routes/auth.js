import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { UnauthorizedError, ValidationError } from '../middleware/errorHandler.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', authenticateToken, (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  // This endpoint exists for API completeness
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
authRouter.get('/me', authenticateToken, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role
  });
});

// POST /api/auth/change-password
authRouter.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 4) {
      throw new ValidationError('New password must be at least 4 characters');
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newPasswordHash, req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});
