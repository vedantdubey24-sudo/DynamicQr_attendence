import { PrismaClient } from '@prisma/client';
import { env, getDatabaseUrlDiagnostics } from './environment.js';

const dbUrl = env.DATABASE_URL;
const dbDiag = getDatabaseUrlDiagnostics(dbUrl);

if (env.NODE_ENV !== 'test') {
  console.info(
    `[DB Config] present=${dbDiag.present}, protocol=${dbDiag.protocol}, host=${dbDiag.hostname}, port=${dbDiag.port}, pgbouncer=${dbDiag.pgbouncer}`
  );
}

export const prisma = new PrismaClient({
  ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL database connected successfully via Prisma');
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
}
