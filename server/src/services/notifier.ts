import { prisma } from "../lib/prisma";
import { emitToUsers } from "../realtime/io";

export interface NotificationData {
  type: string; // mention | task_assigned | task_updated | reminder | escalation | meeting_invite | meeting_reminder | thread_reply
  title: string;
  body?: string;
  link?: string;
}

/**
 * Delivery pipeline for all notifications. In-app (DB row + realtime push) today;
 * an email/push adapter can be added here without touching call sites.
 */
export async function notify(userIds: string[], data: NotificationData) {
  const unique = [...new Set(userIds)];
  for (const userId of unique) {
    const notification = await prisma.notification.create({
      data: { userId, type: data.type, title: data.title, body: data.body, link: data.link },
    });
    emitToUsers([userId], "notification:new", notification);
  }
}
