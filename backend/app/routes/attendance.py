"""
Attendance Routes — Session creation, QR token generation, and session management.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app import db
from app.models import (
    User, AttendanceSession, TeacherAssignment, SecurityAuditEvent, utcnow
)
from app.services.qr_service import QRTokenService

attendance_bp = Blueprint('attendance', __name__)


def require_teacher():
    """Check that the current JWT belongs to an approved teacher."""
    claims = get_jwt()
    if claims.get('role') != 'TEACHER':
        return None, ({'error': 'Teacher access required'}, 403)
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user or user.role != 'TEACHER' or user.status != 'APPROVED':
        return None, ({'error': 'Active teacher access required'}, 403)
    return user, None


@attendance_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_session():
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    class_id = data.get('class_id')
    division_id = data.get('division_id')
    subject_id = data.get('subject_id')

    if not all([class_id, division_id, subject_id]):
        return jsonify({'error': 'class_id, division_id, and subject_id are required'}), 400

    # Verify teacher has this assignment
    assignment = TeacherAssignment.query.filter_by(
        teacher_id=teacher.id,
        class_id=class_id,
        division_id=division_id,
        subject_id=subject_id,
    ).first()

    if not assignment:
        return jsonify({'error': 'You are not assigned to this class/division/subject combination'}), 403

    # Check for existing active session
    active = AttendanceSession.query.filter_by(
        teacher_id=teacher.id, status='ACTIVE'
    ).first()

    if active:
        # Check if it has expired
        now = utcnow()
        if now >= active.expires_at:
            active.status = 'EXPIRED'
            db.session.commit()
        else:
            return jsonify({
                'error': 'You already have an active session. Close it before starting a new one.',
                'active_session_id': active.id,
            }), 409

    # Create the session
    session = QRTokenService.create_session(
        teacher_id=teacher.id,
        class_id=class_id,
        division_id=division_id,
        subject_id=subject_id,
    )

    db.session.add(SecurityAuditEvent(
        event_type='SESSION_CREATED',
        actor_id=teacher.id,
        ip_address=request.remote_addr,
        details={'session_id': session.id},
    ))
    db.session.commit()

    # Generate the first QR token
    token_data = QRTokenService.generate_token(session)

    return jsonify({
        'message': 'Attendance session started',
        'session': session.to_dict(),
        'qr': token_data,
    }), 201


@attendance_bp.route('/sessions', methods=['GET'])
@jwt_required()
def list_sessions():
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    sessions = AttendanceSession.query.filter_by(
        teacher_id=teacher.id
    ).order_by(AttendanceSession.starts_at.desc()).limit(20).all()

    # Auto-expire any sessions past their deadline
    now = utcnow()
    for s in sessions:
        if s.status == 'ACTIVE' and now >= s.expires_at:
            s.status = 'EXPIRED'
    db.session.commit()

    return jsonify({
        'sessions': [s.to_dict() for s in sessions]
    }), 200


@attendance_bp.route('/sessions/<int:session_id>', methods=['GET'])
@jwt_required()
def get_session(session_id):
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    session = db.session.get(AttendanceSession, session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if session.teacher_id != teacher.id:
        return jsonify({'error': 'Access denied'}), 403

    # Auto-expire if needed
    QRTokenService.check_and_expire_session(session)

    return jsonify({'session': session.to_dict()}), 200


@attendance_bp.route('/sessions/<int:session_id>/current-qr', methods=['GET'])
@jwt_required()
def get_current_qr(session_id):
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    session = db.session.get(AttendanceSession, session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if session.teacher_id != teacher.id:
        return jsonify({'error': 'Access denied'}), 403

    # Check and auto-expire
    QRTokenService.check_and_expire_session(session)

    if session.status != 'ACTIVE':
        return jsonify({
            'error': 'Session is no longer active',
            'status': session.status,
            'session': session.to_dict(),
        }), 410

    token_data = QRTokenService.generate_token(session)
    if not token_data:
        return jsonify({
            'error': 'Session has expired',
            'status': session.status,
            'session': session.to_dict(),
        }), 410

    return jsonify({
        'qr': token_data,
        'session': session.to_dict(),
    }), 200


@attendance_bp.route('/sessions/<int:session_id>/close', methods=['POST'])
@jwt_required()
def close_session(session_id):
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    session = db.session.get(AttendanceSession, session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if session.teacher_id != teacher.id:
        return jsonify({'error': 'Access denied'}), 403

    if session.status != 'ACTIVE':
        return jsonify({'error': f'Session is already {session.status}'}), 400

    QRTokenService.close_session(session)

    db.session.add(SecurityAuditEvent(
        event_type='SESSION_CLOSED',
        actor_id=teacher.id,
        ip_address=request.remote_addr,
        details={'session_id': session.id},
    ))
    db.session.commit()

    return jsonify({
        'message': 'Session closed',
        'session': session.to_dict(),
    }), 200
