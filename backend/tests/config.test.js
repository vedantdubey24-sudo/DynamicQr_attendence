import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import {
  buildEnvConfig,
  sanitizeDatabaseUrl,
  getDatabaseUrlDiagnostics,
} from '../src/config/environment.js';

describe('Production Environment Secret Validation', () => {
  it('Throws a clear error in production when JWT_SECRET is missing', () => {
    expect(() =>
      buildEnvConfig({
        NODE_ENV: 'production',
        OTP_HMAC_SECRET: 'prod-hmac-secret',
      })
    ).toThrow(/Missing required production environment variable\(s\): JWT_SECRET/);
  });

  it('Throws a clear error in production when OTP_HMAC_SECRET is missing', () => {
    expect(() =>
      buildEnvConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-jwt-secret',
      })
    ).toThrow(/Missing required production environment variable\(s\): OTP_HMAC_SECRET/);
  });

  it('Accepts JWT_SECRET_KEY fallback in production for Flask compatibility', () => {
    const cfg = buildEnvConfig({
      NODE_ENV: 'production',
      JWT_SECRET_KEY: 'flask-migrated-jwt-secret',
      OTP_HMAC_SECRET: 'prod-hmac-secret',
    });
    expect(cfg.JWT_SECRET).toBe('flask-migrated-jwt-secret');
    expect(cfg.OTP_HMAC_SECRET).toBe('prod-hmac-secret');
  });

  it('Allows development fallback secrets when NODE_ENV is not production', () => {
    const cfg = buildEnvConfig({ NODE_ENV: 'development' });
    expect(cfg.JWT_SECRET).toBeTruthy();
    expect(cfg.OTP_HMAC_SECRET).toBeTruthy();
  });
});

describe('Render Trust Proxy & Rate Limiting', () => {
  it('Configures Express trust proxy to 1 hop', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('Tracks rate limits per client IP via X-Forwarded-For without ValidationError', async () => {
    const resIp1First = await request(app)
      .post('/api/admin/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({});

    expect(resIp1First.status).toBe(400);
    const remainingIp1First = Number(resIp1First.headers['ratelimit-remaining']);
    expect(remainingIp1First).toBe(99);

    const resIp2First = await request(app)
      .post('/api/admin/login')
      .set('X-Forwarded-For', '203.0.113.20')
      .send({});

    expect(resIp2First.status).toBe(400);
    // Different client IP gets a fresh 100-request bucket (99 remaining)
    expect(Number(resIp2First.headers['ratelimit-remaining'])).toBe(99);

    const resIp1Second = await request(app)
      .post('/api/admin/login')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({});

    expect(Number(resIp1Second.headers['ratelimit-remaining'])).toBe(98);
  });
});

describe('DATABASE_URL Sanitization & Safe Diagnostics', () => {
  it('Trims whitespace and strips surrounding quotes from DATABASE_URL', () => {
    const cleaned = sanitizeDatabaseUrl('  "postgresql://user:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"  ');
    expect(cleaned).toBe('postgresql://user:secret@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  });

  it('Automatically appends pgbouncer=true for port 6543 Supabase transaction pooler', () => {
    const cleaned = sanitizeDatabaseUrl('postgresql://postgres.ref:secret@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres');
    expect(cleaned).toContain('pgbouncer=true');
  });

  it('Diagnostics report presence, protocol, and hostname without leaking credentials', () => {
    const diag = getDatabaseUrlDiagnostics('postgresql://postgres.ref:SuperSecretPassword@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true');
    expect(diag).toEqual({
      present: true,
      protocol: 'postgresql:',
      hostname: 'aws-0-ap-southeast-2.pooler.supabase.com',
      port: '6543',
      pgbouncer: true,
    });
    expect(JSON.stringify(diag)).not.toContain('SuperSecretPassword');
    expect(JSON.stringify(diag)).not.toContain('postgres.ref');
  });
});
