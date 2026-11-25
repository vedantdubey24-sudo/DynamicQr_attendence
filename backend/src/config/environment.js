import dotenv from 'dotenv';
dotenv.config();

const DEV_JWT_SECRET = 'institution-attendance-jwt-secret-key-32bytes-long';
const DEV_OTP_HMAC_SECRET = 'institution-attendance-hmac-secret-key-32bytes-long';

export function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  // Trim whitespace and strip accidental surrounding quotes
  let cleaned = rawUrl.trim().replace(/^["'](.*)["']$/, '$1').trim();
  if (!cleaned) return '';

  // Prisma requires pgbouncer=true for Supabase transaction pooler (port 6543)
  try {
    const parsed = new URL(cleaned);
    if (
      (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
      parsed.port === '6543' &&
      !parsed.searchParams.has('pgbouncer')
    ) {
      parsed.searchParams.set('pgbouncer', 'true');
      cleaned = parsed.toString();
    }
  } catch {
    // Keep cleaned string so diagnostics/Prisma report the format issue safely
  }

  return cleaned;
}

export function getDatabaseUrlDiagnostics(rawUrl) {
  if (!rawUrl) {
    return { present: false, protocol: null, hostname: null, port: null, pgbouncer: false };
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      present: true,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || '5432',
      pgbouncer: parsed.searchParams.get('pgbouncer') === 'true',
    };
  } catch {
    return {
      present: true,
      protocol: 'invalid-url',
      hostname: null,
      port: null,
      pgbouncer: false,
    };
  }
}

export function buildEnvConfig(sourceEnv = process.env) {
  const nodeEnv = sourceEnv.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = sourceEnv.JWT_SECRET || sourceEnv.JWT_SECRET_KEY;
  const otpHmacSecret = sourceEnv.OTP_HMAC_SECRET;

  if (isProduction) {
    const missing = [];
    if (!jwtSecret) missing.push('JWT_SECRET');
    if (!otpHmacSecret) missing.push('OTP_HMAC_SECRET');

    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variable(s): ${missing.join(', ')}. ` +
          'Refusing to start with development fallback secrets.'
      );
    }
  }

  return {
    PORT: parseInt(sourceEnv.PORT || '5000', 10),
    NODE_ENV: nodeEnv,
    DATABASE_URL: sanitizeDatabaseUrl(sourceEnv.DATABASE_URL || ''),
    JWT_SECRET: jwtSecret || DEV_JWT_SECRET,
    JWT_EXPIRES_IN: sourceEnv.JWT_EXPIRES_IN || '2h',
    OTP_HMAC_SECRET: otpHmacSecret || DEV_OTP_HMAC_SECRET,
    GMAIL_ADDRESS: sourceEnv.GMAIL_ADDRESS || '',
    GMAIL_CLIENT_ID: sourceEnv.GMAIL_CLIENT_ID || '',
    GMAIL_CLIENT_SECRET: sourceEnv.GMAIL_CLIENT_SECRET || '',
    GMAIL_REFRESH_TOKEN: sourceEnv.GMAIL_REFRESH_TOKEN || '',
    FRONTEND_URL: sourceEnv.FRONTEND_URL || 'http://localhost:5173',
  };
}

export const env = buildEnvConfig(process.env);
