# TeamCollab — Messaging & Task Platform

A Slack/Teams-style collaboration platform where teams across departments chat in real
time, mention people by name, department, or hierarchy level, turn any message into an
assigned task, and never lose track of who owes what.

## Features

**Chat**
- Public, private, department, and direct-message channels
- Real-time messaging (Socket.IO) with threads, typing indicators, presence dots,
  unread badges, and file/image attachments

**Mentions with org awareness**
- `@dan` — a person · `@engineering` — everyone in a department ·
  `@managers` / `@dept-heads` / `@admins` — a hierarchy level (scoped to the channel's
  department when it has one) · `@everyone` — the whole org
- Composer autocomplete for all target kinds; every mention lands in the recipient's
  notification inbox instantly

**Tasks**
- Assign any message as a task, or create tasks directly (also as meeting action items)
- Assign to a person, a whole department, or a role group — expanded to concrete people
- Status (open / in progress / done), priority, due dates, acknowledgment
- Dashboard: my tasks, tasks I assigned, and an org-wide "who's assigned what" view
  with filters by status/department/assignee and group-by-assignee

**Reminders & escalation**
- Automatic notification on assignment
- Due-soon reminder (24h before), overdue reminder to assignee + assigner
- If an overdue task was never acknowledged, it escalates to the assignee's manager

**Meetings**
- Schedule with individual or whole-department invites, RSVP, pre-start reminders
- Action items are real tasks linked to the meeting

**Admin**
- Manage departments, department heads, role levels, reporting lines (the hierarchy
  that powers mention targeting and escalation), and deactivate users

## Stack

- **Server** — Node.js, TypeScript, Express, Socket.IO, Prisma (SQLite in dev,
  Postgres-ready by switching the datasource)
- **Web** — React, Vite, Tailwind CSS, React Router, socket.io-client
- **Tests** — Vitest + Supertest (mention resolution, assignment fan-out,
  reminder/escalation selection, API auth/permissions)

## Getting started

```bash
npm run setup     # install deps, create SQLite schema, seed the demo org
npm run dev       # server on :3021, web on :5179
```

Open http://localhost:5179 and sign in with a demo account (password `password123`):

| Email | Role |
| --- | --- |
| alice@demo.co | Admin |
| eva@demo.co | Engineering dept head |
| mark@demo.co | Engineering manager (reports to Eva) |
| dan@demo.co / dana@demo.co | Engineers (report to Mark) |
| mia@demo.co / max@demo.co / molly@demo.co | Marketing |
| sam@demo.co / sara@demo.co | Sales |

Tip: open two browsers as two different users to watch realtime chat, mentions, and
notifications flow between them.

```bash
npm test          # server test suite
npm run build     # type-check + production builds
```

## Notes

- Notifications are delivered in-app (DB + realtime push). The delivery pipeline is a
  single function (`server/src/services/notifier.ts`) — plug an email or push provider
  in there when needed.
- The reminder scheduler runs in-process every 60s (`server/src/services/reminderScheduler.ts`).
  Escalation grace period is configurable via `ESCALATION_GRACE_MS`.
- `server/.env` ships with dev defaults (SQLite path, dev JWT secret). Change
  `JWT_SECRET` and switch Prisma to Postgres for production.
- Ports: the API listens on `PORT` from `server/.env` (default 3021); the web dev
  server uses 5179 (see `web/vite.config.ts` — change both proxy targets if you
  change the API port). If a port is taken, Vite picks the next free one and prints
  the actual URL in the terminal.
