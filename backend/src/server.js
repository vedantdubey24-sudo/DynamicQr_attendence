import app from './app.js';
import { env } from './config/environment.js';
import { connectDB, prisma } from './config/database.js';

const PORT = env.PORT || 5000;

async function bootstrap() {
  await connectDB();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Node.js Express server running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 CORS enabled for: ${env.FRONTEND_URL}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await prisma.$disconnect();
      console.log('Database disconnected.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
