using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;

/// <summary>
/// Background pass every 60s (started from Global.asax):
///  - due-soon reminder 24h before a task's due date
///  - overdue reminder to assignees + assigner
///  - escalation to each assignee's manager when a task is >= 1h overdue and
///    was never acknowledged
///  - meeting reminder 15 minutes before start
/// Reminders table rows act as sent-once markers.
/// </summary>
public static class ReminderScheduler
{
    private static Timer _timer;

    public static void Start()
    {
        if (_timer != null) return;
        _timer = new Timer(_ => SafeRun(), null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(60));
    }

    private static void SafeRun()
    {
        try { RunPass(); }
        catch (Exception ex) { System.Diagnostics.Trace.TraceError("Reminder pass failed: " + ex); }
    }

    private static bool AlreadySent(int taskId, string kind)
    {
        return Db.Scalar("SELECT 1 FROM Reminders WHERE TaskId = @t AND Kind = @k",
            Db.P("@t", taskId), Db.P("@k", kind)) != null;
    }

    private static void MarkSent(int taskId, string kind)
    {
        try { Db.Exec("INSERT INTO Reminders (TaskId, Kind) VALUES (@t, @k)", Db.P("@t", taskId), Db.P("@k", kind)); }
        catch { /* unique constraint: already marked by a concurrent pass */ }
    }

    public static void RunPass()
    {
        var tasks = Db.Query(
            @"SELECT t.Id, t.Title, t.DueDate, t.AcknowledgedAt, t.AssignerId
              FROM Tasks t WHERE t.Status <> 'COMPLETED' AND t.DueDate IS NOT NULL");

        foreach (DataRow task in tasks.Rows)
        {
            var taskId = (int)task["Id"];
            var title = (string)task["Title"];
            var due = (DateTime)task["DueDate"];
            var now = DateTime.UtcNow;
            var dueLabel = due.ToString("yyyy-MM-dd HH:mm");

            var assignees = new List<int>();
            var managers = new Dictionary<int, List<string>>(); // managerId -> assignee names
            foreach (DataRow a in Db.Query(
                @"SELECT ta.UserId, u.Name, u.ManagerId
                  FROM TaskAssignees ta JOIN Users u ON u.Id = ta.UserId
                  WHERE ta.TaskId = @t", Db.P("@t", taskId)).Rows)
            {
                assignees.Add((int)a["UserId"]);
                var managerId = a["ManagerId"] as int?;
                if (managerId.HasValue)
                {
                    if (!managers.ContainsKey(managerId.Value)) managers[managerId.Value] = new List<string>();
                    managers[managerId.Value].Add((string)a["Name"]);
                }
            }

            if (due > now && (due - now).TotalHours <= 24 && !AlreadySent(taskId, "DUE_SOON"))
            {
                NotificationService.Notify(assignees, "reminder",
                    "Task due soon: " + title, "Due " + dueLabel, "Tasks.aspx");
                MarkSent(taskId, "DUE_SOON");
            }

            if (due <= now)
            {
                if (!AlreadySent(taskId, "OVERDUE"))
                {
                    NotificationService.Notify(assignees.Concat(new[] { (int)task["AssignerId"] }),
                        "reminder", "Task overdue: " + title, "Was due " + dueLabel, "Tasks.aspx");
                    MarkSent(taskId, "OVERDUE");
                }

                var unacknowledged = task["AcknowledgedAt"] == DBNull.Value;
                if (unacknowledged && (now - due).TotalHours >= 1 && !AlreadySent(taskId, "ESCALATION"))
                {
                    foreach (var pair in managers.Where(p => !assignees.Contains(p.Key)))
                    {
                        NotificationService.Notify(new[] { pair.Key }, "escalation",
                            "Escalation: unacknowledged overdue task for " + string.Join(", ", pair.Value),
                            "\"" + title + "\" was due " + dueLabel + " and has not been acknowledged.",
                            "Tasks.aspx");
                    }
                    MarkSent(taskId, "ESCALATION");
                }
            }
        }

        // Meeting reminders 15 minutes before start.
        var meetings = Db.Query(
            @"SELECT Id, Title, StartsAt, OrganizerId FROM Meetings
              WHERE ReminderSentAt IS NULL
                AND StartsAt > SYSUTCDATETIME()
                AND StartsAt <= DATEADD(MINUTE, 15, SYSUTCDATETIME())");
        foreach (DataRow meeting in meetings.Rows)
        {
            var meetingId = (int)meeting["Id"];
            var attendees = new List<int> { (int)meeting["OrganizerId"] };
            foreach (DataRow a in Db.Query(
                "SELECT UserId FROM MeetingAttendees WHERE MeetingId = @m", Db.P("@m", meetingId)).Rows)
                attendees.Add((int)a["UserId"]);

            NotificationService.Notify(attendees, "meeting_reminder",
                "Meeting starting soon: " + meeting["Title"],
                "Starts " + ((DateTime)meeting["StartsAt"]).ToString("yyyy-MM-dd HH:mm"),
                "Meetings.aspx");
            Db.Exec("UPDATE Meetings SET ReminderSentAt = SYSUTCDATETIME() WHERE Id = @m", Db.P("@m", meetingId));
        }
    }
}
