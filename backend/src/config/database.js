import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL database connected successfully via Prisma');
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
}
