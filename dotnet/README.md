# TeamCollab — ASP.NET Web Forms + SQL Server edition

A C#/.NET Framework rebuild of the TeamCollab platform (the Node/React original
lives in the repo root), prepared for a Web Forms team to own and extend.

## Getting it running (Visual Studio, ~10 minutes)

1. **Database**: create an empty SQL Server database (e.g. `TeamCollab`) and run
   `Database/schema.sql` against it. Optionally run `Database/seed.sql` for a demo
   org (all demo passwords: `password123`).
2. **Connection string**: edit `TeamCollabWebForms/Web.config` →
   `connectionStrings/TeamCollab` to point at your server.
3. **Open the site**: Visual Studio → *File → Open → Web Site…* → pick the
   `TeamCollabWebForms` folder (it is a Web Site project — no .sln/.csproj needed;
   pages and `App_Code` compile automatically). Press F5.
4. Register the first account — **the first registered user becomes ADMIN**.
5. **OTP emails**: fill in `system.net/mailSettings` in Web.config and set
   `SmtpConfigured=true`. Until then, login codes are appended to
   `App_Data/otp.log` (readable by admins).

> ⚠️ **Handover note:** this codebase was written on a Linux machine where
> Web Forms cannot be compiled, so it has NOT been build-verified. Expect a
> shakedown pass in Visual Studio — the architecture and SQL are sound, but
> budget time for compile/markup fixes before first run.

## Architecture

```
Database/schema.sql        All tables (see comments per column)
Database/seed.sql          Optional demo org
TeamCollabWebForms/
  Web.config               Connection string, forms auth, SMTP settings
  Global.asax              Starts the reminder scheduler on app start
  Site.master(.cs)         Layout: sidebar nav, unread badge, sign-out
  Styles/site.css          All styling (status/priority chips, chat, tiles)
  App_Code/
    Db.cs                  ADO.NET helper (Query/Scalar/Exec/Insert, parameterized)
    AuthHelper.cs          SHA256+salt hashing, Forms Auth, CurrentUser, handles
    OtpService.cs          Request/Verify one-time codes, rate limits, SMTP or otp.log
    MentionService.cs      @handle / @dept-slug / @managers / @everyone resolution
    TaskService.cs         Assignment fan-out (person/dept/role), 4-stage status,
                           CompletedAt stamping, acknowledge
    NotificationService.cs Insert + unread count (single write path — add email/SMS here)
    ReminderScheduler.cs   60s pass: due-soon (24h), overdue, manager escalation
                           (1h grace, unacknowledged), meeting reminders (15 min)
  Login.aspx / Register.aspx      OTP + password auth (anonymous access)
  Chat.aspx                       Channels + DMs; Timer/UpdatePanel refresh (5s);
                                  mentions; “assign as task” per message
  Tasks.aspx / NewTask.aspx       Filterable dashboard; person/dept/role targets
  Productivity.aspx               Org tiles + per-person table (on-time %, avg time…)
  Meetings.aspx                   Schedule w/ dept invites, RSVP, action items
  Team.aspx                       Managers add teammates by name + phone (OTP login)
  Admin.aspx                      Departments, heads, roles, reporting lines, deactivate
  Notifications.aspx              Inbox (marks read on open)
```

## Domain rules (same as the Node original)

- **Roles**: `ADMIN`, `DEPT_HEAD`, `MANAGER`, `MEMBER`. `Users.ManagerId` forms the
  reporting chain; it powers `@managers`-style mentions and escalation.
- **Task stages**: `NOT_STARTED → DECISION_MAKING → IN_PROGRESS → COMPLETED`.
  `CompletedAt` is stamped on completion (cleared on reopen) and feeds productivity.
- **Acknowledge**: an assignee confirming they saw a task. Overdue + unacknowledged
  for 1h ⇒ the assignee's manager gets an escalation notification (once per task).
- **Group assignment**: department/role targets expand to concrete users at creation
  (`TaskAssignees.Via/ViaLabel` records how each person got the task).
- **OTP**: codes are 6 digits, hashed, 5-minute expiry, max 5 attempts, max 3
  requests per 10 min, single-use; unknown identifiers get a silent success
  (no account enumeration).

## Suggested extension points (deliberately left for the team)

- **Threads** on messages (add `ParentId INT NULL` to `Messages`)
- **File attachments** (FileUpload control + an `Attachments` table)
- **True push chat** — swap the 5s Timer for SignalR 2.x
- **Search page** (`LIKE` over Messages/Tasks/Users)
- **Email/SMS notifications** — one insertion point: `NotificationService.Notify`
- **Delete/archive** for channels, meetings, users (only deactivate exists today)
