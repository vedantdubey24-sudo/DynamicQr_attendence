"""
OTP Service — Secure OTP generation, hashing, and verification.
"""

import hmac
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from flask import current_app
from app import db
from app.models import OTPChallenge, utcnow


class OTPService:
    """Handles OTP creation, hashing, verification, and rate limiting."""

    OTP_LENGTH = 6
    OTP_EXPIRY_MINUTES = 5
    RESEND_COOLDOWN_SECONDS = 60
    MAX_SENDS_PER_HOUR = 5
    MAX_ATTEMPTS = 5

    @staticmethod
    def is_valid_otp(otp: object) -> bool:
        return (
            isinstance(otp, str)
            and len(otp) == OTPService.OTP_LENGTH
            and otp.isascii()
            and otp.isdigit()
        )

    @staticmethod
    def _compute_hmac(otp: str, email: str, purpose: str) -> str:
        """Compute HMAC-SHA-256 of OTP bound to email and purpose."""
        secret = current_app.config['OTP_HMAC_SECRET'].encode('utf-8')
        message = f"{email}:{purpose}:{otp}".encode('utf-8')
        return hmac.new(secret, message, hashlib.sha256).hexdigest()

    @classmethod
    def check_rate_limit(cls, email: str, purpose: str) -> dict:
        """
        Check rate limits:
        - 60-second resend cooldown
        - Max 5 sends per rolling hour
        Returns dict with 'allowed' bool and optional 'error'/'retry_after'.
        """
        now = utcnow()
        one_hour_ago = now - timedelta(hours=1)

        # Count OTPs sent in last hour
        hourly_count = OTPChallenge.query.filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == purpose,
            OTPChallenge.created_at >= one_hour_ago,
        ).count()

        if hourly_count >= cls.MAX_SENDS_PER_HOUR:
            return {
                'allowed': False,
                'error': 'Too many OTP requests. Please try again later.',
                'retry_after': 3600,
            }

        # Check resend cooldown
        last_challenge = OTPChallenge.query.filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == purpose,
        ).order_by(OTPChallenge.created_at.desc()).first()

        if last_challenge:
            elapsed = (now - last_challenge.created_at).total_seconds()
            if elapsed < cls.RESEND_COOLDOWN_SECONDS:
                remaining = int(cls.RESEND_COOLDOWN_SECONDS - elapsed)
                return {
                    'allowed': False,
                    'error': f'Please wait {remaining} seconds before requesting a new OTP.',
                    'retry_after': remaining,
                }

        return {'allowed': True}

    @classmethod
    def create_challenge(cls, email: str, purpose: str) -> str:
        """
        Create a new OTP challenge.
        - Invalidates previous active challenges.
        - Returns the raw OTP (to be sent via email).
        """
        now = utcnow()
        email = email.strip().lower()

        # Invalidate all previous active challenges for this email+purpose
        OTPChallenge.query.filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == purpose,
            OTPChallenge.is_consumed == False,
            OTPChallenge.expires_at > now,
        ).update({'is_consumed': True})

        # Generate cryptographically secure 6-digit OTP
        otp = ''.join([str(secrets.randbelow(10)) for _ in range(cls.OTP_LENGTH)])

        # Store HMAC hash
        otp_hash = cls._compute_hmac(otp, email, purpose)

        challenge = OTPChallenge(
            email=email,
            otp_hash=otp_hash,
            purpose=purpose,
            attempts=0,
            max_attempts=cls.MAX_ATTEMPTS,
            expires_at=now + timedelta(minutes=cls.OTP_EXPIRY_MINUTES),
            is_consumed=False,
        )
        db.session.add(challenge)

        return otp

    @classmethod
    def verify_otp(cls, email: str, purpose: str, otp: str) -> dict:
        """
        Verify an OTP.
        Returns dict with 'valid' bool, 'error' on failure, 'challenge_id' on success.
        """
        if not cls.is_valid_otp(otp):
            return {'valid': False, 'error': 'OTP must contain exactly 6 digits.'}

        email = email.strip().lower()
        now = utcnow()

        # Find the latest active challenge
        challenge = OTPChallenge.query.filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == purpose,
            OTPChallenge.is_consumed == False,
            OTPChallenge.expires_at > now,
        ).order_by(OTPChallenge.created_at.desc()).first()

        if not challenge:
            return {'valid': False, 'error': 'No active OTP found. Please request a new one.'}

        # Check max attempts
        if challenge.attempts >= challenge.max_attempts:
            challenge.is_consumed = True
            db.session.commit()
            return {'valid': False, 'error': 'Maximum verification attempts exceeded. Please request a new OTP.'}

        # Increment attempts
        challenge.attempts += 1

        # Verify using constant-time comparison
        expected_hash = cls._compute_hmac(otp, email, purpose)
        if not hmac.compare_digest(challenge.otp_hash, expected_hash):
            db.session.commit()
            remaining = challenge.max_attempts - challenge.attempts
            return {
                'valid': False,
                'error': f'Invalid OTP. {remaining} attempt(s) remaining.',
            }

        # Mark as consumed (single-use)
        challenge.is_consumed = True
        db.session.commit()

        return {'valid': True, 'challenge_id': challenge.id}
