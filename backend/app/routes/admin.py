"""
Admin Routes — Allowlist management, teacher approval, and admin authentication.
"""

import csv
import io
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity, get_jwt
)
from werkzeug.security import check_password_hash
from app import db
from app.models import (
    User, ApprovedTeacherEmail, TeacherProfile, TeacherAssignment,
    SecurityAuditEvent, AcademicYear, Class, Division, Subject, utcnow
)

admin_bp = Blueprint('admin', __name__)


def require_admin():
    """Check that the current JWT belongs to an admin user."""
    claims = get_jwt()
    if claims.get('role') != 'ADMIN':
        return None, ({'error': 'Admin access required'}, 403)
    identity = get_jwt_identity()
    user = db.session.get(User, int(identity))
    if not user or user.role != 'ADMIN':
        return None, ({'error': 'Admin access required'}, 403)
    return user, None


# ── Admin Login ────────────────────────────────────────────
@admin_bp.route('/login', methods=['POST'])
def admin_login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email, role='ADMIN').first()
    if not user or not user.password_hash:
        return jsonify({'error': 'Invalid credentials'}), 401

    if not check_password_hash(user.password_hash, password):
        # Log failed attempt
        db.session.add(SecurityAuditEvent(
            event_type='ADMIN_LOGIN_FAILED',
            ip_address=request.remote_addr,
            details={'email': email},
        ))
        db.session.commit()
        return jsonify({'error': 'Invalid credentials'}), 401

    token = create_access_token(
        identity=str(user.id),
        additional_claims={'role': 'ADMIN', 'email': user.email}
    )

    db.session.add(SecurityAuditEvent(
        event_type='ADMIN_LOGIN_SUCCESS',
        actor_id=user.id,
        ip_address=request.remote_addr,
    ))
    db.session.commit()

    return jsonify({
        'access_token': token,
        'user': user.to_dict(),
    }), 200


# ── Approved Teacher Emails (Allowlist) ────────────────────
@admin_bp.route('/approved-teacher-emails', methods=['POST'])
@jwt_required()
def add_approved_email():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email address required'}), 400

    # Check if already exists
    existing = ApprovedTeacherEmail.query.filter_by(email=email).first()
    if existing:
        return jsonify({'error': 'Email already in the approved list'}), 409

    entry = ApprovedTeacherEmail(
        email=email,
        is_used=False,
        created_by=admin.id,
    )
    db.session.add(entry)

    db.session.add(SecurityAuditEvent(
        event_type='APPROVED_EMAIL_ADDED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'email': email},
    ))
    db.session.commit()

    return jsonify({'message': 'Email approved successfully', 'entry': entry.to_dict()}), 201


@admin_bp.route('/approved-teacher-emails/csv', methods=['POST'])
@jwt_required()
def upload_csv():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    if 'file' not in request.files:
        return jsonify({'error': 'CSV file required'}), 400

    file = request.files['file']
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be a CSV'}), 400

    try:
        content = file.read().decode('utf-8')
        reader = csv.reader(io.StringIO(content))

        added = []
        skipped = []
        for row in reader:
            if not row:
                continue
            email = row[0].strip().lower()
            if not email or '@' not in email:
                skipped.append({'email': email, 'reason': 'Invalid email'})
                continue

            existing = ApprovedTeacherEmail.query.filter_by(email=email).first()
            if existing:
                skipped.append({'email': email, 'reason': 'Already exists'})
                continue

            entry = ApprovedTeacherEmail(
                email=email,
                is_used=False,
                created_by=admin.id,
            )
            db.session.add(entry)
            added.append(email)

        db.session.add(SecurityAuditEvent(
            event_type='APPROVED_EMAILS_CSV_UPLOADED',
            actor_id=admin.id,
            ip_address=request.remote_addr,
            details={'added_count': len(added), 'skipped_count': len(skipped)},
        ))
        db.session.commit()

        return jsonify({
            'message': f'{len(added)} email(s) added, {len(skipped)} skipped',
            'added': added,
            'skipped': skipped,
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to process CSV file'}), 400


@admin_bp.route('/approved-teacher-emails', methods=['GET'])
@jwt_required()
def list_approved_emails():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    entries = ApprovedTeacherEmail.query.order_by(ApprovedTeacherEmail.created_at.desc()).all()
    return jsonify({'entries': [e.to_dict() for e in entries]}), 200


@admin_bp.route('/approved-teacher-emails/<int:entry_id>', methods=['PATCH'])
@jwt_required()
def update_approved_email(entry_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    entry = db.session.get(ApprovedTeacherEmail, entry_id)
    if not entry:
        return jsonify({'error': 'Entry not found'}), 404

    data = request.get_json() or {}
    if 'email' in data:
        new_email = data['email'].strip().lower()
        if not entry.is_used:
            entry.email = new_email

    db.session.commit()
    return jsonify({'entry': entry.to_dict()}), 200


@admin_bp.route('/approved-teacher-emails/<int:entry_id>', methods=['DELETE'])
@jwt_required()
def delete_approved_email(entry_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    entry = db.session.get(ApprovedTeacherEmail, entry_id)
    if not entry:
        return jsonify({'error': 'Entry not found'}), 404

    target_email = entry.email

    # If an associated teacher account exists, clean up and delete it
    teacher_user = User.query.filter_by(email=target_email).first()
    if teacher_user:
        from app.models import (
            AttendanceSession,
            QRToken,
            TeacherAssignment,
            TeacherProfile,
            LoginCodeCredential,
            RecoveryAuthorization,
        )

        # 1. Clean up attendance sessions and QR tokens
        sessions = AttendanceSession.query.filter_by(teacher_id=teacher_user.id).all()
        for s in sessions:
            QRToken.query.filter_by(session_id=s.id).delete()
        AttendanceSession.query.filter_by(teacher_id=teacher_user.id).delete()

        # 2. Clean up assignments, credentials, and profile
        RecoveryAuthorization.query.filter_by(user_id=teacher_user.id).delete()
        LoginCodeCredential.query.filter_by(user_id=teacher_user.id).delete()
        TeacherAssignment.query.filter_by(teacher_id=teacher_user.id).delete()
        TeacherProfile.query.filter_by(user_id=teacher_user.id).delete()

        # 3. Delete the user
        db.session.delete(teacher_user)

    # 4. Clean up any pending OTP challenges for this email
    from app.models import OTPChallenge
    OTPChallenge.query.filter_by(email=target_email).delete()

    # 5. Delete the allowlist entry
    db.session.delete(entry)

    db.session.add(SecurityAuditEvent(
        event_type='APPROVED_EMAIL_DELETED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'email': target_email, 'account_deleted': bool(teacher_user)},
    ))
    db.session.commit()
    return jsonify({
        'message': f'Email {target_email} successfully removed from allowlist'
    }), 200


# ── Teacher Approval / Rejection ──────────────────────────
@admin_bp.route('/teachers/pending', methods=['GET'])
@jwt_required()
def list_pending_teachers():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    status_filter = request.args.get('status', 'PENDING')
    teachers = User.query.filter_by(role='TEACHER', status=status_filter).all()

    from app.services.assignment_service import AssignmentService
    from app.services.email_service import EmailService

    result = []
    for t in teachers:
        data = t.to_dict()
        if t.profile:
            data['profile'] = t.profile.to_dict()
        data['teaching_assignments'] = AssignmentService.get_grouped_teaching_assignments(t.id)
        result.append(data)

    return jsonify({'teachers': result}), 200


@admin_bp.route('/teachers/<int:teacher_id>/approve', methods=['POST'])
@admin_bp.route('/faculty/<int:teacher_id>/approve', methods=['POST', 'PATCH'])
@jwt_required()
def approve_teacher(teacher_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    teacher = User.query.filter_by(id=teacher_id, role='TEACHER').first()
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    if teacher.status != 'PENDING':
        return jsonify({'error': f'Teacher is already {teacher.status}'}), 400

    teacher.status = 'APPROVED'

    # If explicit assignments are passed, save them
    data = request.get_json(silent=True) or {}
    assignments_data = data.get('teaching_assignments') or data.get('assignments')
    if assignments_data and len(assignments_data) > 0:
        from app.services.assignment_service import AssignmentService
        AssignmentService.save_teacher_assignments(teacher.id, assignments_data)

    db.session.add(SecurityAuditEvent(
        event_type='TEACHER_APPROVED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'teacher_id': teacher_id},
    ))
    db.session.commit()

    # Send automated confirmation email
    from app.services.email_service import EmailService
    EmailService.send_approval_email(teacher.email)

    return jsonify({'message': 'Teacher approved successfully', 'teacher': teacher.to_dict()}), 200


@admin_bp.route('/teachers/<int:teacher_id>/reject', methods=['POST'])
@admin_bp.route('/faculty/<int:teacher_id>/reject', methods=['POST', 'PATCH'])
@jwt_required()
def reject_teacher(teacher_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    teacher = User.query.filter_by(id=teacher_id, role='TEACHER').first()
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    if teacher.status not in ('PENDING',):
        return jsonify({'error': f'Teacher cannot be rejected in {teacher.status} status'}), 400

    teacher.status = 'REJECTED'

    db.session.add(SecurityAuditEvent(
        event_type='TEACHER_REJECTED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'teacher_id': teacher_id},
    ))
    db.session.commit()

    return jsonify({'message': 'Teacher rejected'}), 200


@admin_bp.route('/departments', methods=['GET'])
@jwt_required()
def list_departments():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    from app.models import Department
    from app.constants import DEPARTMENTS
    existing_depts = {d.name: d for d in Department.query.all()}
    created_any = False
    for dept_name in DEPARTMENTS:
        if dept_name not in existing_depts:
            dept = Department(name=dept_name)
            db.session.add(dept)
            created_any = True
    if created_any:
        db.session.commit()

    departments = Department.query.order_by(Department.id.asc()).all()
    return jsonify({'departments': [d.to_dict() for d in departments]}), 200


@admin_bp.route('/faculty/<int:teacher_id>/department', methods=['POST', 'PATCH'])
@admin_bp.route('/teachers/<int:teacher_id>/department', methods=['POST', 'PATCH'])
@jwt_required()
def update_faculty_department(teacher_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    teacher = User.query.filter_by(id=teacher_id, role='TEACHER').first()
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    data = request.get_json() or {}
    dept_name = (data.get('department') or '').strip()
    dept_id = data.get('department_id')

    from app.models import Department
    from app.constants import DEPARTMENTS
    dept = None
    if dept_id:
        dept = db.session.get(Department, int(dept_id))
    elif dept_name:
        matched_name = None
        for d_name in DEPARTMENTS:
            if d_name.lower() == dept_name.lower():
                matched_name = d_name
                break
        if matched_name:
            dept = Department.query.filter_by(name=matched_name).first()
            if not dept:
                dept = Department(name=matched_name)
                db.session.add(dept)
                db.session.flush()

    if not dept:
        return jsonify({'error': 'Invalid department specified. Must match one of the 9 official departments.'}), 400

    profile = teacher.profile
    if not profile:
        profile = TeacherProfile(user_id=teacher.id, full_name='Faculty', staff_id=f'STAFF-{teacher.id}')
        db.session.add(profile)

    old_dept = profile.department
    profile.department = dept.name
    profile.department_id = dept.id

    db.session.add(SecurityAuditEvent(
        event_type='FACULTY_DEPARTMENT_UPDATED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'teacher_id': teacher_id, 'old_department': old_dept, 'new_department': dept.name},
    ))
    db.session.commit()

    from app.services.assignment_service import AssignmentService
    res = teacher.to_dict()
    res['profile'] = profile.to_dict()
    res['teaching_assignments'] = AssignmentService.get_grouped_teaching_assignments(teacher.id)

    return jsonify({
        'message': f'Department successfully updated to {dept.name}',
        'teacher': res,
    }), 200


@admin_bp.route('/faculty/<int:teacher_id>/status', methods=['POST', 'PATCH'])
@admin_bp.route('/teachers/<int:teacher_id>/status', methods=['POST', 'PATCH'])
@jwt_required()
def update_faculty_status(teacher_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    teacher = User.query.filter_by(id=teacher_id, role='TEACHER').first()
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    data = request.get_json() or {}
    new_status = (data.get('status') or '').strip().upper()
    if new_status not in ('APPROVED', 'SUSPENDED', 'REJECTED', 'PENDING'):
        return jsonify({'error': 'Invalid status. Allowed values: APPROVED, SUSPENDED, REJECTED, PENDING'}), 400

    old_status = teacher.status
    teacher.status = new_status

    db.session.add(SecurityAuditEvent(
        event_type='TEACHER_STATUS_UPDATED',
        actor_id=admin.id,
        ip_address=request.remote_addr,
        details={'teacher_id': teacher_id, 'old_status': old_status, 'new_status': new_status},
    ))
    db.session.commit()

    return jsonify({'message': f'Faculty status updated to {new_status}', 'teacher': teacher.to_dict()}), 200


# ── Teacher Assignment Management ─────────────────────────
@admin_bp.route('/teachers/<int:teacher_id>/assignments', methods=['POST'])
@jwt_required()
def add_assignment(teacher_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    teacher = User.query.filter_by(id=teacher_id, role='TEACHER').first()
    if not teacher:
        return jsonify({'error': 'Teacher not found'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    class_id = data.get('class_id')
    division_id = data.get('division_id')
    subject_id = data.get('subject_id')

    if not all([class_id, division_id, subject_id]):
        return jsonify({'error': 'class_id, division_id, and subject_id are required'}), 400

    # Verify entities exist
    if not db.session.get(Class, class_id):
        return jsonify({'error': 'Class not found'}), 404
    if not db.session.get(Division, division_id):
        return jsonify({'error': 'Division not found'}), 404
    if not db.session.get(Subject, subject_id):
        return jsonify({'error': 'Subject not found'}), 404

    # Check duplicate
    existing = TeacherAssignment.query.filter_by(
        teacher_id=teacher_id, class_id=class_id,
        division_id=division_id, subject_id=subject_id
    ).first()
    if existing:
        return jsonify({'error': 'Assignment already exists'}), 409

    assignment = TeacherAssignment(
        teacher_id=teacher_id,
        class_id=class_id,
        division_id=division_id,
        subject_id=subject_id,
    )
    db.session.add(assignment)
    db.session.commit()

    return jsonify({'message': 'Assignment added', 'assignment': assignment.to_dict()}), 201


@admin_bp.route('/teachers/<int:teacher_id>/assignments/<int:assignment_id>', methods=['DELETE'])
@jwt_required()
def remove_assignment(teacher_id, assignment_id):
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    assignment = TeacherAssignment.query.filter_by(
        id=assignment_id, teacher_id=teacher_id
    ).first()
    if not assignment:
        return jsonify({'error': 'Assignment not found'}), 404

    db.session.delete(assignment)
    db.session.commit()

    return jsonify({'message': 'Assignment removed'}), 200


# ── Academic Data (classes, divisions, subjects) ───────────
@admin_bp.route('/academic-years', methods=['GET'])
@jwt_required()
def list_academic_years():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    years = AcademicYear.query.filter_by(is_active=True).all()
    return jsonify({'academic_years': [y.to_dict() for y in years]}), 200


@admin_bp.route('/classes', methods=['GET'])
@jwt_required()
def list_classes():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    year_id = request.args.get('academic_year_id')
    query = Class.query
    if year_id:
        query = query.filter_by(academic_year_id=int(year_id))
    classes = query.all()
    return jsonify({'classes': [c.to_dict() for c in classes]}), 200


@admin_bp.route('/divisions', methods=['GET'])
@jwt_required()
def list_divisions():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    class_id = request.args.get('class_id')
    query = Division.query
    if class_id:
        query = query.filter_by(class_id=int(class_id))
    divisions = query.all()
    return jsonify({'divisions': [d.to_dict() for d in divisions]}), 200


@admin_bp.route('/subjects', methods=['GET'])
@jwt_required()
def list_subjects():
    admin, err = require_admin()
    if err:
        return jsonify(err[0]), err[1]

    subjects = Subject.query.all()
    return jsonify({'subjects': [s.to_dict() for s in subjects]}), 200
