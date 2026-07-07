/**
 * Seeds a demo organization so the app is explorable immediately:
 * 3 departments, a manager hierarchy, channels, messages, tasks and a meeting.
 * All demo accounts use the password "password123".
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = bcrypt.hashSync("password123", 10);

let phoneCounter = 0;
function nextPhone() {
  phoneCounter += 1;
  return `+9190000000${String(phoneCounter).padStart(2, "0")}`;
}

async function upsertUser(data: {
  name: string;
  handle: string;
  email: string;
  roleLevel: string;
  departmentId?: string;
  managerId?: string;
}) {
  const phone = nextPhone();
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      roleLevel: data.roleLevel,
      departmentId: data.departmentId ?? null,
      managerId: data.managerId ?? null,
      phone,
    },
    create: { ...data, passwordHash, phone },
  });
}

async function main() {
  // Departments
  const engineering = await prisma.department.upsert({
    where: { slug: "engineering" },
    update: {},
    create: { name: "Engineering", slug: "engineering" },
  });
  const marketing = await prisma.department.upsert({
    where: { slug: "marketing" },
    update: {},
    create: { name: "Marketing", slug: "marketing" },
  });
  const sales = await prisma.department.upsert({
    where: { slug: "sales" },
    update: {},
    create: { name: "Sales", slug: "sales" },
  });

  // People — a realistic chain: member -> manager -> dept head
  const alice = await upsertUser({
    name: "Alice Admin", handle: "alice", email: "alice@demo.co", roleLevel: "ADMIN",
  });
  const eva = await upsertUser({
    name: "Eva Engle", handle: "eva", email: "eva@demo.co",
    roleLevel: "DEPT_HEAD", departmentId: engineering.id,
  });
  const mark = await upsertUser({
    name: "Mark Mendez", handle: "mark", email: "mark@demo.co",
    roleLevel: "MANAGER", departmentId: engineering.id, managerId: eva.id,
  });
  const dan = await upsertUser({
    name: "Dan Diaz", handle: "dan", email: "dan@demo.co",
    roleLevel: "MEMBER", departmentId: engineering.id, managerId: mark.id,
  });
  const dana = await upsertUser({
    name: "Dana Doyle", handle: "dana", email: "dana@demo.co",
    roleLevel: "MEMBER", departmentId: engineering.id, managerId: mark.id,
  });
  const mia = await upsertUser({
    name: "Mia Moore", handle: "mia", email: "mia@demo.co",
    roleLevel: "DEPT_HEAD", departmentId: marketing.id,
  });
  const max = await upsertUser({
    name: "Max Malik", handle: "max", email: "max@demo.co",
    roleLevel: "MANAGER", departmentId: marketing.id, managerId: mia.id,
  });
  const molly = await upsertUser({
    name: "Molly Mason", handle: "molly", email: "molly@demo.co",
    roleLevel: "MEMBER", departmentId: marketing.id, managerId: max.id,
  });
  const sam = await upsertUser({
    name: "Sam Singh", handle: "sam", email: "sam@demo.co",
    roleLevel: "DEPT_HEAD", departmentId: sales.id,
  });
  const sara = await upsertUser({
    name: "Sara Silva", handle: "sara", email: "sara@demo.co",
    roleLevel: "MEMBER", departmentId: sales.id, managerId: sam.id,
  });

  await prisma.department.update({ where: { id: engineering.id }, data: { headId: eva.id } });
  await prisma.department.update({ where: { id: marketing.id }, data: { headId: mia.id } });
  await prisma.department.update({ where: { id: sales.id }, data: { headId: sam.id } });

  const everyone = [alice, eva, mark, dan, dana, mia, max, molly, sam, sara];

  async function ensureChannel(name: string, opts: { departmentId?: string; memberIds: string[] }) {
    let channel = await prisma.channel.findFirst({ where: { name, type: "PUBLIC" } });
    if (!channel) {
      channel = await prisma.channel.create({
        data: { name, type: "PUBLIC", departmentId: opts.departmentId ?? null, createdById: alice.id },
      });
    }
    for (const userId of opts.memberIds) {
      await prisma.channelMember
        .create({ data: { channelId: channel.id, userId } })
        .catch(() => {});
    }
    return channel;
  }

  const general = await ensureChannel("general", { memberIds: everyone.map((u) => u.id) });
  const engChannel = await ensureChannel("engineering", {
    departmentId: engineering.id,
    memberIds: [eva, mark, dan, dana].map((u) => u.id),
  });
  await ensureChannel("marketing", {
    departmentId: marketing.id,
    memberIds: [mia, max, molly].map((u) => u.id),
  });
  await ensureChannel("sales", {
    departmentId: sales.id,
    memberIds: [sam, sara].map((u) => u.id),
  });

  const messageCount = await prisma.message.count();
  if (messageCount === 0) {
    await prisma.message.create({
      data: {
        channelId: general.id,
        authorId: alice.id,
        content: "Welcome to the team workspace! Use @name to mention people, @engineering to reach a department, or @managers for the leadership group.",
      },
    });
    const kickoff = await prisma.message.create({
      data: {
        channelId: engChannel.id,
        authorId: eva.id,
        content: "@mark can you own the Q3 release checklist? @engineering please review the deploy runbook this week.",
        mentions: {
          create: [
            { targetType: "USER", targetId: mark.id, targetLabel: "Mark Mendez" },
            { targetType: "DEPARTMENT", targetId: engineering.id, targetLabel: "Engineering" },
          ],
        },
      },
    });

    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await prisma.task.create({
      data: {
        title: "Own the Q3 release checklist",
        description: "Coordinate the release checklist and sign-offs.",
        sourceMessageId: kickoff.id,
        assignerId: eva.id,
        priority: "HIGH",
        dueDate: inTwoDays,
        assignees: { create: [{ userId: mark.id, via: "DIRECT" }] },
      },
    });
    await prisma.task.create({
      data: {
        title: "Review the deploy runbook",
        assignerId: eva.id,
        priority: "MEDIUM",
        dueDate: inTwoDays,
        assignees: {
          create: [
            { userId: dan.id, via: "DEPARTMENT", viaLabel: "Engineering" },
            { userId: dana.id, via: "DEPARTMENT", viaLabel: "Engineering" },
            { userId: mark.id, via: "DEPARTMENT", viaLabel: "Engineering" },
          ],
        },
      },
    });

    const tomorrow10 = new Date();
    tomorrow10.setDate(tomorrow10.getDate() + 1);
    tomorrow10.setHours(10, 0, 0, 0);
    const tomorrow11 = new Date(tomorrow10);
    tomorrow11.setHours(11);
    await prisma.meeting.create({
      data: {
        title: "Cross-team sync: Q3 launch",
        description: "Engineering x Marketing alignment on the launch plan.",
        startsAt: tomorrow10,
        endsAt: tomorrow11,
        location: "Zoom",
        organizerId: eva.id,
        attendees: {
          create: [mark, dan, dana, mia, max].map((u) => ({ userId: u.id })),
        },
      },
    });
  }

  console.log("Seeded demo org. Log in with password `password123` or via OTP as any of:");
  for (const u of everyone) console.log(`  ${u.email}  ${u.phone}  — ${u.roleLevel}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
