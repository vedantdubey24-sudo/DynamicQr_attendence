"""
Teacher Routes — Profile and assignment management.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app import db
from app.models import User, TeacherAssignment, TeacherProfile, SecurityAuditEvent
from app.services.assignment_service import AssignmentService
from app.constants import DEPARTMENTS, DESIGNATIONS

teacher_bp = Blueprint('teacher', __name__)


def require_teacher():
    """Check that the current JWT belongs to an approved teacher."""
    claims = get_jwt()
    if claims.get('role') != 'TEACHER':
        return None, ({'error': 'Teacher access required'}, 403)
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user or user.role != 'TEACHER':
        return None, ({'error': 'Teacher access required'}, 403)
    if user.status != 'APPROVED':
        return None, ({'error': 'Account is not active'}, 403)
    return user, None


@teacher_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    data = teacher.to_dict()
    if teacher.profile:
        data['profile'] = teacher.profile.to_dict()
        data['full_name'] = teacher.profile.full_name
        data['staff_id'] = teacher.profile.staff_id
        data['erp_id'] = teacher.profile.erp_id
        data['department'] = teacher.profile.department
        data['department_id'] = teacher.profile.department_id
        data['designation'] = teacher.profile.designation

    # Grouped teaching assignments for catalogue builder
    teaching_assignments = AssignmentService.get_grouped_teaching_assignments(teacher.id)
    data['teaching_assignments'] = teaching_assignments

    # Also return flat assignments for attendance launcher compatibility
    assignments = TeacherAssignment.query.filter_by(teacher_id=teacher.id).all()
    data['assignments'] = [a.to_dict() for a in assignments]

    return jsonify(data), 200


@teacher_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    profile = teacher.profile
    if not profile:
        profile = TeacherProfile(user_id=teacher.id, full_name='Faculty', staff_id=f'STAFF-{teacher.id}')
        db.session.add(profile)

    # Editable fields: department, designation
    if 'department' in data and data['department']:
        dept_str = str(data['department']).strip()
        from app.models import Department
        dept = Department.query.filter_by(name=dept_str).first()
        if not dept:
            dept = Department.query.filter(db.func.lower(Department.name) == dept_str.lower()).first()
        if dept:
            profile.department = dept.name
            profile.department_id = dept.id
        elif dept_str in DEPARTMENTS:
            profile.department = dept_str

    if 'designation' in data and data['designation']:
        desig = str(data['designation']).strip()
        if desig in DESIGNATIONS or True:
            profile.designation = desig

    # If full_name is provided, update it
    if 'full_name' in data and data['full_name'].strip():
        profile.full_name = data['full_name'].strip()

    # Note: Email and erp_id / staff_id are locked and intentionally NOT modified from client input.

    # Update teaching assignments if provided
    assignments_data = data.get('teaching_assignments')
    if assignments_data is not None:
        if not isinstance(assignments_data, list):
            return jsonify({'error': 'teaching_assignments must be a list'}), 400

        # Validate that each assignment has year, subject, and at least one division
        for a in assignments_data:
            if not a.get('subject') or not a.get('divisions') or len(a.get('divisions')) == 0:
                return jsonify({'error': 'Each course assignment must specify a subject and at least one division.'}), 400

        try:
            AssignmentService.save_teacher_assignments(teacher.id, assignments_data)
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'Failed to save course assignments'}), 500

    db.session.add(SecurityAuditEvent(
        event_type='TEACHER_PROFILE_UPDATED',
        actor_id=teacher.id,
        ip_address=request.remote_addr,
        details={'email': teacher.email},
    ))
    db.session.commit()

    # Return refreshed profile & assignments
    teaching_assignments = AssignmentService.get_grouped_teaching_assignments(teacher.id)
    flat_assignments = TeacherAssignment.query.filter_by(teacher_id=teacher.id).all()

    resp_data = teacher.to_dict()
    resp_data['profile'] = profile.to_dict()
    resp_data['full_name'] = profile.full_name
    resp_data['staff_id'] = profile.staff_id
    resp_data['erp_id'] = profile.erp_id
    resp_data['department'] = profile.department
    resp_data['department_id'] = profile.department_id
    resp_data['designation'] = profile.designation
    resp_data['teaching_assignments'] = teaching_assignments
    resp_data['assignments'] = [a.to_dict() for a in flat_assignments]
    resp_data['message'] = 'Profile and teaching courses updated successfully.'

    return jsonify(resp_data), 200


@teacher_bp.route('/assignments', methods=['GET'])
@jwt_required()
def get_assignments():
    teacher, err = require_teacher()
    if err:
        return jsonify(err[0]), err[1]

    assignments = TeacherAssignment.query.filter_by(teacher_id=teacher.id).all()
    grouped = AssignmentService.get_grouped_teaching_assignments(teacher.id)
    return jsonify({
        'assignments': [a.to_dict() for a in assignments],
        'teaching_assignments': grouped,
    }), 200
