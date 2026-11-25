import { prisma } from '../config/database.js';

export async function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const adminId = parseInt(req.user.sub || req.user.id, 10);
    const user = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = user;
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Database authentication check failed' });
  }
}
