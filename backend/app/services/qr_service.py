"""
QR Token Service — Dynamic QR token generation for attendance sessions.
"""

import secrets
import hashlib
from datetime import timedelta
from app import db
from app.models import AttendanceSession, QRToken, utcnow


class QRTokenService:
    """Manages QR token generation and rotation for attendance sessions."""

    SESSION_DURATION_SECONDS = 90
    TOKEN_ROTATION_SECONDS = 5

    @classmethod
    def create_session(cls, teacher_id: int, class_id: int, division_id: int, subject_id: int) -> AttendanceSession:
        """Create a new attendance session with server-side timestamps."""
        now = utcnow()
        expires_at = now + timedelta(seconds=cls.SESSION_DURATION_SECONDS)

        session = AttendanceSession(
            teacher_id=teacher_id,
            class_id=class_id,
            division_id=division_id,
            subject_id=subject_id,
            status='ACTIVE',
            starts_at=now,
            expires_at=expires_at,
        )
        db.session.add(session)
        db.session.commit()

        return session

    @classmethod
    def generate_token(cls, session: AttendanceSession) -> dict | None:
        """
        Generate a new QR token for the given session.
        Returns dict with raw token and metadata, or None if session is expired/closed.
        """
        now = utcnow()

        # Check if session is still active
        if session.status != 'ACTIVE':
            return None

        if now >= session.expires_at:
            # Auto-expire the session
            session.status = 'EXPIRED'
            db.session.commit()
            return None

        # Calculate token expiry (5 seconds or remaining session time, whichever is less)
        token_expiry = now + timedelta(seconds=cls.TOKEN_ROTATION_SECONDS)
        if token_expiry > session.expires_at:
            token_expiry = session.expires_at

        # Generate cryptographically secure random token
        raw_token = secrets.token_urlsafe(32)

        # Store only the SHA-256 hash
        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()

        qr_token = QRToken(
            session_id=session.id,
            token_hash=token_hash,
            issued_at=now,
            expires_at=token_expiry,
            is_revoked=False,
        )
        db.session.add(qr_token)
        db.session.commit()

        return {
            'token': raw_token,
            'token_id': qr_token.id,
            'issued_at': now.isoformat(),
            'expires_at': token_expiry.isoformat(),
            'session_expires_at': session.expires_at.isoformat(),
            'remaining_seconds': max(0, int((session.expires_at - now).total_seconds())),
        }

    @classmethod
    def get_current_token(cls, session: AttendanceSession) -> dict | None:
        """
        Get or generate the current QR token for a session.
        If the last token is still valid (less than 5 seconds old), generate a new one anyway
        since this endpoint is the authoritative source for the current display token.
        """
        now = utcnow()

        if session.status != 'ACTIVE':
            return None

        if now >= session.expires_at:
            session.status = 'EXPIRED'
            db.session.commit()
            return None

        # Check if there's a recent token still valid
        latest_token = QRToken.query.filter(
            QRToken.session_id == session.id,
            QRToken.is_revoked == False,
            QRToken.expires_at > now,
        ).order_by(QRToken.issued_at.desc()).first()

        if latest_token:
            # Token still valid — generate new raw token for display
            # (we can't recover the raw token from the hash)
            return cls.generate_token(session)

        # No valid token — generate new one
        return cls.generate_token(session)

    @classmethod
    def close_session(cls, session: AttendanceSession) -> bool:
        """Manually close an active session."""
        now = utcnow()

        if session.status != 'ACTIVE':
            return False

        session.status = 'CLOSED'
        session.closed_at = now

        # Revoke all active tokens
        QRToken.query.filter(
            QRToken.session_id == session.id,
            QRToken.is_revoked == False,
        ).update({'is_revoked': True})

        db.session.commit()
        return True

    @classmethod
    def check_and_expire_session(cls, session: AttendanceSession) -> bool:
        """Check if a session has expired and update its status."""
        now = utcnow()

        if session.status == 'ACTIVE' and now >= session.expires_at:
            session.status = 'EXPIRED'
            QRToken.query.filter(
                QRToken.session_id == session.id,
                QRToken.is_revoked == False,
            ).update({'is_revoked': True})
            db.session.commit()
            return True

        return False
