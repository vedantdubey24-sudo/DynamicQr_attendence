import { prisma } from '../config/database.js';

export async function logAuditEvent(eventType, actorId = null, ipAddress = null, details = null) {
  try {
    await prisma.securityAuditEvent.create({
      data: {
        event_type: eventType,
        actor_id: actorId,
        ip_address: ipAddress,
        details: details ? details : undefined,
      },
    });
  } catch (err) {
    // Non-blocking security audit failure
    console.error('Audit event log failed:', err.message);
  }
}
