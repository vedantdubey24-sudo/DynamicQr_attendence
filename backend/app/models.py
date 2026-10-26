"""
SQLAlchemy Models — Phase 1
"""

from app import db
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    role = db.Column(db.Enum('ADMIN', 'TEACHER', name='user_role'), nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    status = db.Column(
        db.Enum('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', name='user_status'),
        nullable=False, default='PENDING'
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    # Relationships
    profile = db.relationship('TeacherProfile', backref='user', uselist=False, lazy='joined')
    assignments = db.relationship('TeacherAssignment', backref='teacher', lazy='dynamic')
    login_credentials = db.relationship('LoginCodeCredential', backref='user', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ApprovedTeacherEmail(db.Model):
    __tablename__ = 'approved_teacher_emails'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    is_used = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    used_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'is_used': self.is_used,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'used_at': self.used_at.isoformat() if self.used_at else None,
        }


class Department(db.Model):
    __tablename__ = 'departments'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), unique=True, nullable=False)
    code = db.Column(db.String(50), unique=True, nullable=True)

    teachers = db.relationship('TeacherProfile', backref='department_rel', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
        }


class TeacherProfile(db.Model):
    __tablename__ = 'teacher_profiles'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    full_name = db.Column(db.String(255), nullable=False)
    department = db.Column(db.String(255), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    designation = db.Column(db.String(255), nullable=False)
    staff_id = db.Column(db.String(100), unique=True, nullable=False)

    @property
    def erp_id(self):
        return self.staff_id

    @erp_id.setter
    def erp_id(self, val):
        self.staff_id = val

    def to_dict(self):
        dept_name = self.department_rel.name if self.department_rel else self.department
        return {
            'id': self.id,
            'user_id': self.user_id,
            'full_name': self.full_name,
            'department': dept_name,
            'department_id': self.department_id,
            'designation': self.designation,
            'erp_id': self.staff_id,
            'staff_id': self.staff_id,
            'email': self.user.email if self.user else None,
            'approval_status': self.user.status if self.user else None,
            'is_active': (self.user.status == 'APPROVED') if self.user else False,
            'created_at': self.user.created_at.isoformat() if (self.user and self.user.created_at) else None,
        }


class OTPChallenge(db.Model):
    __tablename__ = 'otp_challenges'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    otp_hash = db.Column(db.String(255), nullable=False)
    purpose = db.Column(
        db.Enum('TEACHER_REGISTRATION', 'LOGIN_CODE_RECOVERY', name='otp_purpose'),
        nullable=False
    )
    attempts = db.Column(db.Integer, nullable=False, default=0)
    max_attempts = db.Column(db.Integer, nullable=False, default=5)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_consumed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class AcademicYear(db.Model):
    __tablename__ = 'academic_years'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    year_name = db.Column(db.String(50), unique=True, nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    classes = db.relationship('Class', backref='academic_year', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'year_name': self.year_name,
            'is_active': self.is_active,
        }


class Class(db.Model):
    __tablename__ = 'classes'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    class_name = db.Column(db.String(100), nullable=False)
    academic_year_id = db.Column(db.Integer, db.ForeignKey('academic_years.id'), nullable=False)

    divisions = db.relationship('Division', backref='class_', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'class_name': self.class_name,
            'academic_year_id': self.academic_year_id,
            'academic_year': self.academic_year.year_name if self.academic_year else None,
        }


class Division(db.Model):
    __tablename__ = 'divisions'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    division_name = db.Column(db.String(50), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'division_name': self.division_name,
            'class_id': self.class_id,
            'class_name': self.class_.class_name if self.class_ else None,
        }


class Subject(db.Model):
    __tablename__ = 'subjects'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    subject_name = db.Column(db.String(255), nullable=False)
    subject_code = db.Column(db.String(50), unique=True, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'subject_name': self.subject_name,
            'subject_code': self.subject_code,
        }


class TeacherAssignment(db.Model):
    __tablename__ = 'teacher_assignments'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=False)
    division_id = db.Column(db.Integer, db.ForeignKey('divisions.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)

    # Relationships for easy access
    class_rel = db.relationship('Class', lazy='joined')
    division_rel = db.relationship('Division', lazy='joined')
    subject_rel = db.relationship('Subject', lazy='joined')

    __table_args__ = (
        db.UniqueConstraint('teacher_id', 'class_id', 'division_id', 'subject_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'teacher_id': self.teacher_id,
            'class_id': self.class_id,
            'division_id': self.division_id,
            'subject_id': self.subject_id,
            'class_name': self.class_rel.class_name if self.class_rel else None,
            'division_name': self.division_rel.division_name if self.division_rel else None,
            'subject_name': self.subject_rel.subject_name if self.subject_rel else None,
            'subject_code': self.subject_rel.subject_code if self.subject_rel else None,
            'academic_year': self.class_rel.academic_year.year_name if self.class_rel and self.class_rel.academic_year else None,
        }


class LoginCodeCredential(db.Model):
    __tablename__ = 'login_code_credentials'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    code_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)
    is_revoked = db.Column(db.Boolean, nullable=False, default=False)


class RecoveryAuthorization(db.Model):
    __tablename__ = 'recovery_authorizations'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_consumed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class AttendanceSession(db.Model):
    __tablename__ = 'attendance_sessions'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=False)
    division_id = db.Column(db.Integer, db.ForeignKey('divisions.id'), nullable=False)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    status = db.Column(
        db.Enum('ACTIVE', 'EXPIRED', 'CLOSED', name='session_status'),
        nullable=False, default='ACTIVE'
    )
    starts_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    closed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    teacher = db.relationship('User', lazy='joined')
    class_rel = db.relationship('Class', lazy='joined')
    division_rel = db.relationship('Division', lazy='joined')
    subject_rel = db.relationship('Subject', lazy='joined')
    tokens = db.relationship('QRToken', backref='session', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'teacher_id': self.teacher_id,
            'class_id': self.class_id,
            'division_id': self.division_id,
            'subject_id': self.subject_id,
            'status': self.status,
            'starts_at': self.starts_at.isoformat() if self.starts_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'class_name': self.class_rel.class_name if self.class_rel else None,
            'division_name': self.division_rel.division_name if self.division_rel else None,
            'subject_name': self.subject_rel.subject_name if self.subject_rel else None,
            'subject_code': self.subject_rel.subject_code if self.subject_rel else None,
        }


class QRToken(db.Model):
    __tablename__ = 'qr_tokens'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.Integer, db.ForeignKey('attendance_sessions.id'), nullable=False)
    token_hash = db.Column(db.String(64), nullable=False)
    issued_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_revoked = db.Column(db.Boolean, nullable=False, default=False)


class SecurityAuditEvent(db.Model):
    __tablename__ = 'security_audit_events'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_type = db.Column(db.String(100), nullable=False, index=True)
    actor_id = db.Column(db.Integer, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    details = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
