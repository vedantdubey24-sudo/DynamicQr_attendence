"""
Auth Routes — Teacher registration, OTP verification, login, and recovery.
"""

import secrets
import hashlib
from datetime import timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from app.models import (
    User, ApprovedTeacherEmail, TeacherProfile,
    LoginCodeCredential, RecoveryAuthorization,
    SecurityAuditEvent, utcnow
)
from app.services.otp_service import OTPService
from app.services.email_service import EmailService

auth_bp = Blueprint('auth', __name__)


# ── Check Email (pre-registration) ────────────────────────
@auth_bp.route('/teacher/check-email', methods=['POST'])
def check_email():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email address required'}), 400

    # Check approved list
    approved = ApprovedTeacherEmail.query.filter_by(email=email).first()
    if not approved:
        return jsonify({
            'error': 'Invalid input: This email is not authorized for teacher registration.'
        }), 403

    if approved.is_used:
        return jsonify({'error': 'This email has already been used for registration.'}), 409

    # Check if already registered
    existing_user = User.query.filter_by(email=email, role='TEACHER').first()
    if existing_user:
        return jsonify({'error': 'An account with this email already exists.'}), 409

    return jsonify({'message': 'Email is approved for registration', 'email': email}), 200


# ── Send OTP ──────────────────────────────────────────────
@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    purpose = data.get('purpose', 'TEACHER_REGISTRATION')

    if not email or '@' not in email:
        return jsonify({'error': 'Valid email address required'}), 400

    if purpose not in ('TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY'):
        return jsonify({'error': 'Invalid purpose'}), 400

    # For registration, verify the email is in the approved list
    if purpose == 'TEACHER_REGISTRATION':
        approved = ApprovedTeacherEmail.query.filter_by(email=email).first()
        if not approved:
            return jsonify({
                'error': 'Invalid input: This email is not authorized for teacher registration.'
            }), 403
        if approved.is_used:
            return jsonify({'error': 'This email has already been used for registration.'}), 409

    # For recovery, verify the account exists
    if purpose == 'LOGIN_CODE_RECOVERY':
        user = User.query.filter_by(email=email, role='TEACHER').first()
        if not user:
            # Don't reveal whether the email exists
            return jsonify({'message': 'If the email is registered, an OTP will be sent.'}), 200
        if user.status not in ('APPROVED',):
            return jsonify({'message': 'If the email is registered, an OTP will be sent.'}), 200

    # Check rate limits
    rate_check = OTPService.check_rate_limit(email, purpose)
    if not rate_check['allowed']:
        return jsonify({
            'error': rate_check['error'],
            'retry_after': rate_check.get('retry_after'),
        }), 429

    # Generate and store OTP
    otp = OTPService.create_challenge(email, purpose)

    # Send via email
    if not EmailService.send_otp_email(email, otp, purpose):
        db.session.rollback()
        return jsonify({'error': 'Failed to send OTP email. Please try again.'}), 500

    db.session.add(SecurityAuditEvent(
        event_type='OTP_SENT',
        ip_address=request.remote_addr,
        details={'email': email, 'purpose': purpose},
    ))
    db.session.commit()

    return jsonify({'message': 'OTP sent to your email address.'}), 200


# ── Verify OTP ────────────────────────────────────────────
@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    otp_value = data.get('otp')
    purpose = data.get('purpose', 'TEACHER_REGISTRATION')

    if not email or not isinstance(otp_value, str):
        return jsonify({'error': 'Email and OTP are required'}), 400

    otp = otp_value.strip()
    if not OTPService.is_valid_otp(otp):
        return jsonify({'error': 'OTP must contain exactly 6 digits.'}), 400

    result = OTPService.verify_otp(email, purpose, otp)

    if not result['valid']:
        return jsonify({'error': result['error']}), 400

    # Generate a short-lived verification token
    verification_token = create_access_token(
        identity=email,
        additional_claims={
            'purpose': purpose,
            'verified_email': email,
            'type': 'EMAIL_VERIFICATION',
        },
        expires_delta=timedelta(minutes=15),
    )

    db.session.add(SecurityAuditEvent(
        event_type='OTP_VERIFIED',
        ip_address=request.remote_addr,
        details={'email': email, 'purpose': purpose},
    ))
    db.session.commit()

    return jsonify({
        'message': 'OTP verified successfully',
        'verification_token': verification_token,
    }), 200


# ── Teacher Registration ──────────────────────────────────
@auth_bp.route('/register/teacher', methods=['POST'])
@jwt_required()
def register_teacher():
    # Verify the JWT is a verification token
    claims = get_jwt()
    if claims.get('type') != 'EMAIL_VERIFICATION':
        return jsonify({'error': 'Invalid verification token'}), 401
    if claims.get('purpose') != 'TEACHER_REGISTRATION':
        return jsonify({'error': 'Token not valid for registration'}), 401

    verified_email = claims.get('verified_email')
    if not verified_email:
        return jsonify({'error': 'Invalid verification token'}), 401

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    full_name = (data.get('full_name') or '').strip()
    department = (data.get('department') or '').strip()
    designation = (data.get('designation') or '').strip()
    erp_id = (data.get('erp_id') or data.get('staff_id') or '').strip()

    if not all([full_name, department, designation, erp_id]):
        return jsonify({'error': 'All fields are required: full_name, department, designation, erp_id'}), 400

    # Re-verify the email is still approved and unused (within transaction)
    try:
        approved = ApprovedTeacherEmail.query.filter_by(
            email=verified_email, is_used=False
        ).with_for_update().first()

        if not approved:
            return jsonify({'error': 'Email is not available for registration.'}), 403

        # Check for existing user
        existing = User.query.filter_by(email=verified_email).first()
        if existing:
            return jsonify({'error': 'An account with this email already exists.'}), 409

        # Validate department against the 9 official departments
        from app.models import Department
        from app.constants import DEPARTMENTS
        matched_name = None
        for d_name in DEPARTMENTS:
            if d_name.lower() == department.lower():
                matched_name = d_name
                break
        if not matched_name:
            return jsonify({'error': 'Invalid department selected. Please choose from the 9 official departments.'}), 400

        dept = Department.query.filter_by(name=matched_name).first()
        if not dept:
            dept = Department(name=matched_name)
            db.session.add(dept)
            db.session.flush()

        # Check for duplicate ERP ID
        existing_staff = TeacherProfile.query.filter_by(staff_id=erp_id).first()
        if existing_staff:
            return jsonify({'error': 'ERP ID already in use.'}), 409

        # Create user
        user = User(
            email=verified_email,
            role='TEACHER',
            status='PENDING',
        )
        db.session.add(user)
        db.session.flush()  # Get user.id

        # Create profile
        profile = TeacherProfile(
            user_id=user.id,
            full_name=full_name,
            department=dept.name,
            department_id=dept.id,
            designation=designation,
            staff_id=erp_id,
        )
        db.session.add(profile)

        # Save submitted teaching assignments
        from app.services.assignment_service import AssignmentService
        assignments_data = data.get('teaching_assignments') or data.get('assignments') or []
        AssignmentService.save_teacher_assignments(user.id, assignments_data)

        # Generate login code
        login_code = secrets.token_urlsafe(12)
        code_hash = generate_password_hash(login_code)

        credential = LoginCodeCredential(
            user_id=user.id,
            code_hash=code_hash,
            expires_at=None,  # No expiry for now
            is_revoked=False,
        )
        db.session.add(credential)

        # Mark approved email as used
        approved.is_used = True
        approved.used_at = utcnow()

        db.session.add(SecurityAuditEvent(
            event_type='TEACHER_REGISTERED',
            actor_id=user.id,
            ip_address=request.remote_addr,
            details={'email': verified_email, 'erp_id': erp_id, 'staff_id': erp_id, 'department': dept.name, 'assignments_count': len(assignments_data)},
        ))

        db.session.commit()

        # Send login code via email
        EmailService.send_login_code_email(verified_email, login_code)

        return jsonify({
            'message': 'Registration successful! Your login code has been sent to your email.',
            'user': user.to_dict(),
            'login_code': login_code,  # Also shown once in the UI
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Registration failed. Please try again.'}), 500


# ── Teacher Login with Code ───────────────────────────────
@auth_bp.route('/login/code', methods=['POST'])
def login_with_code():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()

    if not email or not code:
        return jsonify({'error': 'Email and login code are required'}), 400

    # Find the teacher
    user = User.query.filter_by(email=email, role='TEACHER').first()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    # Check account status
    if user.status != 'APPROVED':
        status_messages = {
            'PENDING': 'Your account is pending admin approval.',
            'REJECTED': 'Your registration has been rejected. Contact the administrator.',
            'SUSPENDED': 'Your account has been suspended. Contact the administrator.',
        }
        return jsonify({
            'error': status_messages.get(user.status, 'Account is not active.'),
            'status': user.status,
        }), 403

    # Find active login credential
    credential = LoginCodeCredential.query.filter_by(
        user_id=user.id, is_revoked=False
    ).order_by(LoginCodeCredential.created_at.desc()).first()

    if not credential:
        return jsonify({'error': 'No active login code. Use "Forgot Login Code" to generate a new one.'}), 401

    # Check expiry
    now = utcnow()
    if credential.expires_at and now > credential.expires_at:
        return jsonify({'error': 'Login code has expired. Use "Forgot Login Code" to generate a new one.'}), 401

    # Verify code
    if not check_password_hash(credential.code_hash, code):
        db.session.add(SecurityAuditEvent(
            event_type='LOGIN_FAILED',
            ip_address=request.remote_addr,
            details={'email': email},
        ))
        db.session.commit()
        return jsonify({'error': 'Invalid credentials'}), 401

    # Create JWT
    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            'role': 'TEACHER',
            'email': user.email,
        }
    )

    db.session.add(SecurityAuditEvent(
        event_type='TEACHER_LOGIN_SUCCESS',
        actor_id=user.id,
        ip_address=request.remote_addr,
    ))
    db.session.commit()

    return jsonify({
        'access_token': token,
        'user': user.to_dict(),
    }), 200


# ── Logout ────────────────────────────────────────────────
@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    # In a stateless JWT system, the client discards the token.
    # For enhanced security, implement a token blocklist (future improvement).
    identity = get_jwt_identity()
    db.session.add(SecurityAuditEvent(
        event_type='LOGOUT',
        actor_id=int(identity),
        ip_address=request.remote_addr,
    ))
    db.session.commit()
    return jsonify({'message': 'Logged out successfully'}), 200


# ── Forgot Login Code — Send Recovery OTP ─────────────────
@auth_bp.route('/recovery/send-otp', methods=['POST'])
def recovery_send_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required'}), 400

    # Always return the same message to avoid user enumeration
    generic_msg = 'If the email is registered, an OTP will be sent.'

    user = User.query.filter_by(email=email, role='TEACHER').first()
    if not user or user.status not in ('APPROVED',):
        return jsonify({'message': generic_msg}), 200

    # Rate limit
    rate_check = OTPService.check_rate_limit(email, 'LOGIN_CODE_RECOVERY')
    if not rate_check['allowed']:
        return jsonify({
            'error': rate_check['error'],
            'retry_after': rate_check.get('retry_after'),
        }), 429

    otp = OTPService.create_challenge(email, 'LOGIN_CODE_RECOVERY')
    if not EmailService.send_otp_email(email, otp, 'LOGIN_CODE_RECOVERY'):
        db.session.rollback()
        return jsonify({'error': 'Failed to send OTP email. Please try again.'}), 500

    db.session.add(SecurityAuditEvent(
        event_type='OTP_SENT',
        ip_address=request.remote_addr,
        details={'email': email, 'purpose': 'LOGIN_CODE_RECOVERY'},
    ))
    db.session.commit()

    return jsonify({'message': generic_msg}), 200


# ── Forgot Login Code — Verify Recovery OTP ───────────────
@auth_bp.route('/recovery/verify-otp', methods=['POST'])
def recovery_verify_otp():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    otp_value = data.get('otp')

    if not email or not isinstance(otp_value, str):
        return jsonify({'error': 'Email and OTP are required'}), 400

    otp = otp_value.strip()
    if not OTPService.is_valid_otp(otp):
        return jsonify({'error': 'OTP must contain exactly 6 digits.'}), 400

    result = OTPService.verify_otp(email, 'LOGIN_CODE_RECOVERY', otp)
    if not result['valid']:
        return jsonify({'error': result['error']}), 400

    user = User.query.filter_by(email=email, role='TEACHER').first()
    if not user or user.status != 'APPROVED':
        return jsonify({'error': 'Account not eligible for recovery'}), 403

    # Create a recovery authorization token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = utcnow()

    recovery = RecoveryAuthorization(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=10),
        is_consumed=False,
    )
    db.session.add(recovery)
    db.session.commit()

    return jsonify({
        'message': 'Recovery authorized',
        'recovery_token': raw_token,
    }), 200


# ── Reset Login Code ─────────────────────────────────────
@auth_bp.route('/recovery/reset-login-code', methods=['POST'])
def reset_login_code():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    recovery_token = (data.get('recovery_token') or '').strip()
    email = (data.get('email') or '').strip().lower()

    if not recovery_token or not email:
        return jsonify({'error': 'Recovery token and email are required'}), 400

    user = User.query.filter_by(email=email, role='TEACHER').first()
    if not user or user.status != 'APPROVED':
        return jsonify({'error': 'Account not eligible'}), 403

    # Verify recovery token
    token_hash = hashlib.sha256(recovery_token.encode()).hexdigest()
    now = utcnow()

    recovery = RecoveryAuthorization.query.filter_by(
        user_id=user.id,
        token_hash=token_hash,
        is_consumed=False,
    ).first()

    if not recovery:
        return jsonify({'error': 'Invalid recovery token'}), 401

    if now > recovery.expires_at:
        return jsonify({'error': 'Recovery token has expired. Please start over.'}), 401

    # Mark recovery as consumed
    recovery.is_consumed = True

    # Revoke old login codes
    LoginCodeCredential.query.filter_by(
        user_id=user.id, is_revoked=False
    ).update({'is_revoked': True})

    # Generate new login code
    new_code = secrets.token_urlsafe(12)
    code_hash = generate_password_hash(new_code)

    credential = LoginCodeCredential(
        user_id=user.id,
        code_hash=code_hash,
        is_revoked=False,
    )
    db.session.add(credential)

    db.session.add(SecurityAuditEvent(
        event_type='LOGIN_CODE_RESET',
        actor_id=user.id,
        ip_address=request.remote_addr,
    ))
    db.session.commit()

    # Send notifications
    EmailService.send_login_code_email(email, new_code)
    EmailService.send_code_changed_notification(email)

    return jsonify({
        'message': 'Login code has been reset. The new code has been sent to your email.',
        'login_code': new_code,
    }), 200
