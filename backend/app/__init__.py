"""
QR-Based Smart Attendance System — Flask Application Factory
"""

import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy
from datetime import timedelta

db = SQLAlchemy()
jwt = JWTManager()


def create_app(config_override=None):
    """Application factory."""
    app = Flask(__name__)

    # ── Load configuration ──────────────────────────────────
    from dotenv import load_dotenv
    _backend_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(_backend_env):
        load_dotenv(_backend_env)
    else:
        load_dotenv()

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL',
        'mysql+pymysql://root:password@localhost:3306/attendance_system'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_recycle': 280,
        'pool_pre_ping': True,
    }

    # JWT configuration
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'dev-jwt-secret')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=2)
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    # SMTP configuration
    app.config['GMAIL_ADDRESS'] = os.getenv('GMAIL_ADDRESS', '')
    app.config['GMAIL_APP_PASSWORD'] = os.getenv('GMAIL_APP_PASSWORD', '')
    app.config['SMTP_HOST'] = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    app.config['SMTP_PORT'] = int(os.getenv('SMTP_PORT', 587))

    # OTP configuration
    app.config['OTP_HMAC_SECRET'] = os.getenv('OTP_HMAC_SECRET', 'dev-hmac-secret')

    # Frontend URL
    app.config['FRONTEND_URL'] = os.getenv('FRONTEND_URL', 'http://localhost:5173')

    # Apply test overrides
    if config_override:
        app.config.update(config_override)

    # ── Initialize extensions ──────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    CORS(app, origins=[app.config['FRONTEND_URL']], supports_credentials=True)

    # ── JWT error handlers ─────────────────────────────────
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {'error': 'Token has expired', 'code': 'TOKEN_EXPIRED'}, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {'error': 'Invalid token', 'code': 'INVALID_TOKEN'}, 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {'error': 'Authorization required', 'code': 'MISSING_TOKEN'}, 401

    # ── Register blueprints ────────────────────────────────
    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.teacher import teacher_bp
    from app.routes.attendance import attendance_bp

    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(teacher_bp, url_prefix='/api/teacher')
    app.register_blueprint(attendance_bp, url_prefix='/api/attendance')

    # ── Health check ───────────────────────────────────────
    @app.route('/api/health')
    def health():
        return {'status': 'ok', 'service': 'attendance-system'}

    return app
