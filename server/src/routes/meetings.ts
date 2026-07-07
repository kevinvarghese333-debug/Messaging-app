import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { notify } from "../services/notifier";
import { taskInclude } from "../services/taskService";

export const meetingsRouter = Router();

meetingsRouter.use(requireAuth);

const meetingInclude = {
  organizer: { select: { id: true, name: true, handle: true } },
  attendees: { include: { user: { select: { id: true, name: true, handle: true } } } },
  actionItems: { include: taskInclude },
} as const;

meetingsRouter.get("/", async (req, res) => {
  const scope = String(req.query.scope ?? "mine");
  const where =
    scope === "all"
      ? {}
      : {
          OR: [
            { organizerId: req.user.id },
            { attendees: { some: { userId: req.user.id } } },
          ],
        };
  const meetings = await prisma.meeting.findMany({
    where,
    include: meetingInclude,
    orderBy: { startsAt: "asc" },
  });
  res.json({ meetings });
});

meetingsRouter.post("/", async (req, res) => {
  const { title, description, startsAt, endsAt, location, attendeeIds = [], departmentIds = [] } = req.body ?? {};
  if (!title || !startsAt || !endsAt) {
    return res.status(400).json({ error: "title, startsAt and endsAt are required" });
  }
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!(start < end)) return res.status(400).json({ error: "Meeting must end after it starts" });

  const attendeeSet = new Set<string>(attendeeIds);
  for (const departmentId of departmentIds) {
    const deptUsers = await prisma.user.findMany({
      where: { departmentId, active: true },
      select: { id: true },
    });
    for (const u of deptUsers) attendeeSet.add(u.id);
  }
  attendeeSet.delete(req.user.id); // organizer tracked separately

  const meeting = await prisma.meeting.create({
    data: {
      title: String(title),
      description: description ? String(description) : null,
      startsAt: start,
      endsAt: end,
      location: location ? String(location) : null,
      organizerId: req.user.id,
      attendees: { create: [...attendeeSet].map((userId) => ({ userId })) },
    },
    include: meetingInclude,
  });

  await notify([...attendeeSet], {
    type: "meeting_invite",
    title: `${req.user.name} invited you: ${meeting.title}`,
    body: `${start.toISOString().replace("T", " ").slice(0, 16)}${location ? ` · ${location}` : ""}`,
    link: `/meetings`,
  });

  res.json({ meeting });
});

meetingsRouter.post("/:id/respond", async (req, res) => {
  const { response } = req.body ?? {};
  if (!["ACCEPTED", "DECLINED", "PENDING"].includes(response)) {
    return res.status(400).json({ error: "response must be ACCEPTED, DECLINED or PENDING" });
  }
  const attendee = await prisma.meetingAttendee.findUnique({
    where: { meetingId_userId: { meetingId: req.params.id, userId: req.user.id } },
    include: { meeting: true },
  });
  if (!attendee) return res.status(404).json({ error: "You are not invited to this meeting" });

  await prisma.meetingAttendee.update({
    where: { id: attendee.id },
    data: { response },
  });

  if (response !== "PENDING") {
    await notify([attendee.meeting.organizerId], {
      type: "meeting_response",
      title: `${req.user.name} ${response.toLowerCase()} "${attendee.meeting.title}"`,
      link: `/meetings`,
    });
  }
  res.json({ ok: true });
});

meetingsRouter.delete("/:id", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { attendees: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  if (meeting.organizerId !== req.user.id && req.user.roleLevel !== "ADMIN") {
    return res.status(403).json({ error: "Only the organizer can cancel a meeting" });
  }
  await prisma.task.updateMany({ where: { meetingId: meeting.id }, data: { meetingId: null } });
  await prisma.meeting.delete({ where: { id: meeting.id } });
  await notify(
    meeting.attendees.map((a) => a.userId),
    { type: "meeting_cancelled", title: `Meeting cancelled: ${meeting.title}`, link: `/meetings` }
  );
  res.json({ ok: true });
});
