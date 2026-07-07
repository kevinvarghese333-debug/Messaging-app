/**
 * One-off migration for databases created before the 4-stage task workflow:
 *   OPEN -> NOT_STARTED, DONE -> COMPLETED (IN_PROGRESS is unchanged).
 * Also backfills completedAt for already-completed tasks (uses updatedAt).
 * Run with: npm run migrate -w server
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const open = await prisma.task.updateMany({
    where: { status: "OPEN" },
    data: { status: "NOT_STARTED" },
  });
  const done = await prisma.task.updateMany({
    where: { status: "DONE" },
    data: { status: "COMPLETED" },
  });
  const doneTasks = await prisma.task.findMany({
    where: { status: "COMPLETED", completedAt: null },
  });
  for (const task of doneTasks) {
    await prisma.task.update({ where: { id: task.id }, data: { completedAt: task.updatedAt } });
  }
  console.log(`Migrated statuses: ${open.count} OPEN -> NOT_STARTED, ${done.count} DONE -> COMPLETED, backfilled completedAt for ${doneTasks.length} task(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
