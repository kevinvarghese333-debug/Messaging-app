import { Channel } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface ResolvedMention {
  targetType: "USER" | "DEPARTMENT" | "ROLE_LEVEL" | "EVERYONE";
  targetId: string | null;
  targetLabel: string;
  userIds: string[];
}

const ROLE_GROUPS: Record<string, { level: string; label: string }> = {
  managers: { level: "MANAGER", label: "Managers" },
  "dept-heads": { level: "DEPT_HEAD", label: "Department heads" },
  heads: { level: "DEPT_HEAD", label: "Department heads" },
  admins: { level: "ADMIN", label: "Admins" },
};

export function extractMentionTokens(content: string): string[] {
  const tokens = new Set<string>();
  const re = /(^|[\s(])@([a-z0-9][a-z0-9._-]*)/gi;
  let match;
  while ((match = re.exec(content))) {
    tokens.add(match[2].toLowerCase().replace(/[.,;:!?]+$/, ""));
  }
  return [...tokens];
}

/**
 * Resolve @tokens in a message to concrete users.
 * Order: @everyone, role groups (@managers/@dept-heads/@admins — scoped to the
 * channel's department when the channel belongs to one), department slugs, user handles.
 */
export async function resolveMentions(
  content: string,
  channel: Pick<Channel, "departmentId"> | null
): Promise<ResolvedMention[]> {
  const tokens = extractMentionTokens(content);
  const resolved: ResolvedMention[] = [];

  for (const token of tokens) {
    if (token === "everyone" || token === "all") {
      const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
      resolved.push({
        targetType: "EVERYONE",
        targetId: null,
        targetLabel: "everyone",
        userIds: users.map((u) => u.id),
      });
      continue;
    }

    const roleGroup = ROLE_GROUPS[token];
    if (roleGroup) {
      const users = await prisma.user.findMany({
        where: {
          active: true,
          roleLevel: roleGroup.level,
          ...(channel?.departmentId ? { departmentId: channel.departmentId } : {}),
        },
        select: { id: true },
      });
      resolved.push({
        targetType: "ROLE_LEVEL",
        targetId: roleGroup.level,
        targetLabel: roleGroup.label,
        userIds: users.map((u) => u.id),
      });
      continue;
    }

    const department = await prisma.department.findUnique({
      where: { slug: token },
      include: { users: { where: { active: true }, select: { id: true } } },
    });
    if (department) {
      resolved.push({
        targetType: "DEPARTMENT",
        targetId: department.id,
        targetLabel: department.name,
        userIds: department.users.map((u) => u.id),
      });
      continue;
    }

    const user = await prisma.user.findUnique({ where: { handle: token } });
    if (user && user.active) {
      resolved.push({
        targetType: "USER",
        targetId: user.id,
        targetLabel: user.name,
        userIds: [user.id],
      });
    }
    // Unrecognized tokens are ignored — plain text that happens to contain "@".
  }

  return resolved;
}

export function mentionedUserIds(mentions: ResolvedMention[], excludeUserId?: string): string[] {
  const ids = new Set<string>();
  for (const mention of mentions) for (const id of mention.userIds) ids.add(id);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}
