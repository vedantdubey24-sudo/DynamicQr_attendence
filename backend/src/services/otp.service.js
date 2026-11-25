import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { env } from '../config/environment.js';

export class OTPService {
  static OTP_LENGTH = 6;
  static OTP_EXPIRY_MINUTES = 5;
  static RESEND_COOLDOWN_SECONDS = 60;
  static MAX_SENDS_PER_HOUR = 5;
  static MAX_ATTEMPTS = 5;

  static isValidOtp(otp) {
    return (
      typeof otp === 'string' &&
      otp.length === OTPService.OTP_LENGTH &&
      /^\d+$/.test(otp)
    );
  }

  static computeHmac(otp, email, purpose) {
    const message = `${email}:${purpose}:${otp}`;
    return crypto.createHmac('sha256', env.OTP_HMAC_SECRET).update(message).digest('hex');
  }

  static async checkRateLimit(email, purpose) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Count OTPs sent in the last rolling hour
    const hourlyCount = await prisma.oTPChallenge.count({
      where: {
        email,
        purpose,
        created_at: { gte: oneHourAgo },
      },
    });

    if (hourlyCount >= this.MAX_SENDS_PER_HOUR) {
      return {
        allowed: false,
        error: 'Too many OTP requests. Please try again later.',
        retry_after: 3600,
      };
    }

    // Check resend cooldown (60 seconds)
    const lastChallenge = await prisma.oTPChallenge.findFirst({
      where: { email, purpose },
      orderBy: { created_at: 'desc' },
    });

    if (lastChallenge) {
      const elapsedSeconds = (now.getTime() - new Date(lastChallenge.created_at).getTime()) / 1000;
      if (elapsedSeconds < this.RESEND_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(this.RESEND_COOLDOWN_SECONDS - elapsedSeconds);
        return {
          allowed: false,
          error: `Please wait ${remaining} seconds before requesting a new OTP.`,
          retry_after: remaining,
        };
      }
    }

    return { allowed: true };
  }

  static async createChallenge(email, purpose) {
    const now = new Date();
    const normalizedEmail = email.trim().toLowerCase();

    // Invalidate all previous active challenges for this email + purpose
    await prisma.oTPChallenge.updateMany({
      where: {
        email: normalizedEmail,
        purpose,
        is_consumed: false,
        expires_at: { gt: now },
      },
      data: { is_consumed: true },
    });

    // Generate cryptographically secure 6-digit OTP
    let otp = '';
    for (let i = 0; i < this.OTP_LENGTH; i++) {
      otp += crypto.randomInt(0, 10).toString();
    }

    const otpHash = this.computeHmac(otp, normalizedEmail, purpose);
    const expiresAt = new Date(now.getTime() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.oTPChallenge.create({
      data: {
        email: normalizedEmail,
        otp_hash: otpHash,
        purpose,
        attempts: 0,
        max_attempts: this.MAX_ATTEMPTS,
        expires_at: expiresAt,
        is_consumed: false,
      },
    });

    return otp;
  }

  static async verifyOtp(email, purpose, otp) {
    if (!this.isValidOtp(otp)) {
      return { valid: false, error: 'OTP must contain exactly 6 digits.' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();

    const challenge = await prisma.oTPChallenge.findFirst({
      where: {
        email: normalizedEmail,
        purpose,
        is_consumed: false,
        expires_at: { gt: now },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!challenge) {
      return { valid: false, error: 'No active OTP found. Please request a new one.' };
    }

    if (challenge.attempts >= challenge.max_attempts) {
      await prisma.oTPChallenge.update({
        where: { id: challenge.id },
        data: { is_consumed: true },
      });
      return { valid: false, error: 'Maximum verification attempts exceeded. Please request a new OTP.' };
    }

    // Increment attempts
    const updatedAttempts = challenge.attempts + 1;
    await prisma.oTPChallenge.update({
      where: { id: challenge.id },
      data: { attempts: updatedAttempts },
    });

    // Verify using constant-time comparison
    const expectedHash = this.computeHmac(otp, normalizedEmail, purpose);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(challenge.otp_hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );

    if (!isValid) {
      const remaining = challenge.max_attempts - updatedAttempts;
      return {
        valid: false,
        error: `Invalid OTP. ${remaining} attempt(s) remaining.`,
      };
    }

    // Single-use: Mark as consumed
    await prisma.oTPChallenge.update({
      where: { id: challenge.id },
      data: { is_consumed: true },
    });

    return { valid: true, challenge_id: challenge.id };
  }
}
