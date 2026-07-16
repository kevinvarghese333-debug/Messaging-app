using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;

public static class TaskService
{
    public static readonly string[] Statuses = { "NOT_STARTED", "DECISION_MAKING", "IN_PROGRESS", "COMPLETED" };

    public static string StatusLabel(string status)
    {
        switch (status)
        {
            case "NOT_STARTED": return "Not yet started";
            case "DECISION_MAKING": return "Decision making";
            case "IN_PROGRESS": return "In progress";
            case "COMPLETED": return "Completed";
            default: return status;
        }
    }

    /// <summary>Expand person/department/role-level targets into concrete assignees.</summary>
    public static Dictionary<int, string[]> ResolveAssignees(
        IEnumerable<int> userIds, IEnumerable<int> departmentIds, IEnumerable<string> roleLevels)
    {
        // userId -> { Via, ViaLabel }
        var assignees = new Dictionary<int, string[]>();

        foreach (var deptId in departmentIds ?? Enumerable.Empty<int>())
        {
            var deptName = Db.Scalar("SELECT Name FROM Departments WHERE Id = @d", Db.P("@d", deptId)) as string;
            if (deptName == null) continue;
            foreach (DataRow r in Db.Query(
                "SELECT Id FROM Users WHERE Active = 1 AND DepartmentId = @d", Db.P("@d", deptId)).Rows)
            {
                var id = (int)r["Id"];
                if (!assignees.ContainsKey(id)) assignees[id] = new[] { "DEPARTMENT", deptName };
            }
        }

        foreach (var level in roleLevels ?? Enumerable.Empty<string>())
        {
            var label = level == "DEPT_HEAD" ? "Department heads"
                      : char.ToUpper(level[0]) + level.Substring(1).ToLowerInvariant() + "s";
            foreach (DataRow r in Db.Query(
                "SELECT Id FROM Users WHERE Active = 1 AND RoleLevel = @r", Db.P("@r", level)).Rows)
            {
                var id = (int)r["Id"];
                if (!assignees.ContainsKey(id)) assignees[id] = new[] { "ROLE_LEVEL", label };
            }
        }

        foreach (var userId in userIds ?? Enumerable.Empty<int>())
        {
            assignees[userId] = new[] { "DIRECT", null }; // direct assignment wins
        }

        return assignees;
    }

    public static int Create(int assignerId, string assignerName, string title, string description,
        DateTime? dueDate, string priority, int? sourceMessageId, int? meetingId,
        Dictionary<int, string[]> assignees)
    {
        if (assignees.Count == 0) throw new InvalidOperationException("A task needs at least one assignee.");

        var taskId = Db.Insert(
            @"INSERT INTO Tasks (Title, Description, SourceMessageId, AssignerId, Priority, DueDate, MeetingId)
              VALUES (@title, @desc, @src, @assigner, @priority, @due, @meeting)",
            Db.P("@title", title), Db.P("@desc", description), Db.P("@src", sourceMessageId),
            Db.P("@assigner", assignerId), Db.P("@priority", priority ?? "MEDIUM"),
            Db.P("@due", dueDate), Db.P("@meeting", meetingId));

        foreach (var pair in assignees)
        {
            Db.Exec(
                @"INSERT INTO TaskAssignees (TaskId, UserId, Via, ViaLabel) VALUES (@t, @u, @via, @label)",
                Db.P("@t", taskId), Db.P("@u", pair.Key),
                Db.P("@via", pair.Value[0]), Db.P("@label", pair.Value[1]));
        }

        var due = dueDate.HasValue ? " (due " + dueDate.Value.ToString("yyyy-MM-dd HH:mm") + ")" : "";
        NotificationService.Notify(
            assignees.Keys.Where(id => id != assignerId),
            "task_assigned",
            assignerName + " assigned you a task: " + title,
            "Priority " + (priority ?? "MEDIUM") + due,
            "Tasks.aspx");

        return taskId;
    }

    public static void UpdateStatus(int taskId, string status, int actorId, string actorName)
    {
        if (!Statuses.Contains(status)) throw new InvalidOperationException("Invalid status: " + status);

        Db.Exec(
            @"UPDATE Tasks SET Status = @s,
                     CompletedAt = CASE WHEN @s = 'COMPLETED' THEN COALESCE(CompletedAt, SYSUTCDATETIME()) ELSE NULL END,
                     UpdatedAt = SYSUTCDATETIME()
              WHERE Id = @id", Db.P("@s", status), Db.P("@id", taskId));

        var task = Db.Query("SELECT Title, AssignerId FROM Tasks WHERE Id = @id", Db.P("@id", taskId)).Rows[0];
        var interested = new List<int> { (int)task["AssignerId"] };
        foreach (DataRow r in Db.Query("SELECT UserId FROM TaskAssignees WHERE TaskId = @id", Db.P("@id", taskId)).Rows)
            interested.Add((int)r["UserId"]);

        NotificationService.Notify(
            interested.Where(id => id != actorId),
            "task_updated",
            actorName + " moved \"" + task["Title"] + "\" to " + StatusLabel(status).ToLowerInvariant(),
            null, "Tasks.aspx");
    }

    public static void Acknowledge(int taskId, int userId)
    {
        Db.Exec(
            @"UPDATE Tasks SET AcknowledgedAt = COALESCE(AcknowledgedAt, SYSUTCDATETIME())
              WHERE Id = @id AND EXISTS (SELECT 1 FROM TaskAssignees WHERE TaskId = @id AND UserId = @u)",
            Db.P("@id", taskId), Db.P("@u", userId));
    }
}
