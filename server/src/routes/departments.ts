import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, slugify } from "../lib/auth";

export const departmentsRouter = Router();

departmentsRouter.use(requireAuth);

const departmentInclude = {
  head: { select: { id: true, name: true, handle: true } },
  _count: { select: { users: true } },
} as const;

departmentsRouter.get("/", async (_req, res) => {
  const departments = await prisma.department.findMany({
    include: departmentInclude,
    orderBy: { name: "asc" },
  });
  res.json({ departments });
});

departmentsRouter.post("/", requireAdmin, async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const slug = slugify(String(name));
  const existing = await prisma.department.findFirst({
    where: { OR: [{ name: String(name) }, { slug }] },
  });
  if (existing) return res.status(409).json({ error: "A department with this name already exists" });

  const department = await prisma.department.create({
    data: { name: String(name), slug },
    include: departmentInclude,
  });

  // Every department gets its own channel; members are added as users join the dept.
  await prisma.channel.create({
    data: { name: slug, type: "PUBLIC", departmentId: department.id },
  });

  res.json({ department });
});

departmentsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const { name, headId } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    data.name = String(name);
    data.slug = slugify(String(name));
  }
  if (headId !== undefined) data.headId = headId || null;

  const department = await prisma.department.update({
    where: { id: req.params.id },
    data,
    include: departmentInclude,
  });

  // Keep the head's role level in sync with their appointment.
  if (headId) {
    await prisma.user.update({
      where: { id: headId },
      data: { roleLevel: "DEPT_HEAD", departmentId: department.id },
    });
  }
  res.json({ department });
});

departmentsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const count = await prisma.user.count({ where: { departmentId: req.params.id } });
  if (count > 0) {
    return res.status(400).json({ error: "Move its members to another department first" });
  }
  await prisma.channel.deleteMany({ where: { departmentId: req.params.id } });
  await prisma.department.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
