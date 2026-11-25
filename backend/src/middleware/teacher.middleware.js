import { prisma } from '../config/database.js';

export async function requireTeacher(req, res, next) {
  if (!req.user || req.user.role !== 'TEACHER') {
    return res.status(403).json({ error: 'Teacher access required' });
  }

  try {
    const teacherId = parseInt(req.user.sub || req.user.id, 10);
    const user = await prisma.user.findUnique({
      where: { id: teacherId },
    });

    if (!user || user.role !== 'TEACHER') {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    req.teacher = user;
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Teacher authentication check failed' });
  }
}
