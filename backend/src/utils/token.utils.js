import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/environment.js';

export function signAccessToken(payload, expiresIn = env.JWT_EXPIRES_IN) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computeHmac(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}
