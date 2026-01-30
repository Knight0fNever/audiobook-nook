import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getDb } from '../database/init.js';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Also check query parameter for audio streaming (HTML5 audio can't set headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next(new UnauthorizedError('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return next(new UnauthorizedError('User not found'));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expired'));
    }
    return next(new UnauthorizedError('Invalid token'));
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }

  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.userId);

    if (user) {
      req.user = user;
    }
  } catch (error) {
    // Token invalid, but that's okay for optional auth
  }

  next();
}
