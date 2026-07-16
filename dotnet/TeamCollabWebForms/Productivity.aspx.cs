using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Web.UI.WebControls;

public partial class ProductivityPage : System.Web.UI.Page
{
    protected void Page_Load(object sender, EventArgs e)
    {
        if (!IsPostBack)
        {
            foreach (DataRow r in Db.Query("SELECT Id, Name FROM Departments ORDER BY Name").Rows)
                ddlDept.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
            ddlDept.Items.Insert(0, new ListItem("All departments", ""));
            Bind();
        }
    }

    protected void Filters_Changed(object sender, EventArgs e) { Bind(); }

    private static string Pct(int part, int whole)
    {
        return whole == 0 ? "—" : Math.Round(100.0 * part / whole) + "%";
    }

    private static string Hours(List<double> values)
    {
        if (values.Count == 0) return "—";
        var avg = values.Average();
        if (avg < 1) return Math.Round(avg * 60) + "m";
        if (avg < 48) return avg.ToString("0.#") + "h";
        return (avg / 24).ToString("0.#") + "d";
    }

    private void Bind()
    {
        int days = int.Parse(ddlDays.SelectedValue);
        var since = DateTime.UtcNow.AddDays(-days);
        int? deptFilter = ddlDept.SelectedValue == "" ? (int?)null : int.Parse(ddlDept.SelectedValue);

        // One query: every assignment joined to its task and assignee; aggregate in C#.
        var rows = Db.Query(
            @"SELECT ta.UserId, u.Name, u.DepartmentId, d.Name AS DeptName,
                     t.Status, t.DueDate, t.CompletedAt, t.CreatedAt, t.AcknowledgedAt
              FROM TaskAssignees ta
              JOIN Tasks t ON t.Id = ta.TaskId
              JOIN Users u ON u.Id = ta.UserId
              LEFT JOIN Departments d ON d.Id = u.DepartmentId
              WHERE u.Active = 1" + (deptFilter.HasValue ? " AND u.DepartmentId = @dept" : ""),
            deptFilter.HasValue ? new[] { Db.P("@dept", deptFilter.Value) } : new System.Data.SqlClient.SqlParameter[0]);

        var perUser = new Dictionary<int, UserStats>();
        var totals = new UserStats();
        var now = DateTime.UtcNow;

        foreach (DataRow r in rows.Rows)
        {
            var userId = (int)r["UserId"];
            UserStats stats;
            if (!perUser.TryGetValue(userId, out stats))
            {
                stats = new UserStats { Name = (string)r["Name"], Dept = r["DeptName"] as string ?? "—" };
                perUser[userId] = stats;
            }
            Accumulate(stats, r, since, now);
            Accumulate(totals, r, since, now);
        }

        litCompleted.Text = totals.Completed.ToString();
        litOnTime.Text = Pct(totals.OnTime, totals.CompletedWithDue);
        litAvg.Text = Hours(totals.CompletionHours);
        litOverdue.Text = totals.Overdue.ToString();

        gvUsers.DataSource = perUser.Values
            .OrderByDescending(s => s.Completed).ThenBy(s => s.Name)
            .Select(s => new
            {
                Person = s.Name,
                Department = s.Dept,
                Assigned = s.Assigned,
                Completed = s.Completed,
                OnTime = Pct(s.OnTime, s.CompletedWithDue),
                AvgTime = Hours(s.CompletionHours),
                Open = s.Open,
                Overdue = s.Overdue,
                AckRate = Pct(s.Acked, s.Assigned)
            }).ToList();
        gvUsers.DataBind();
    }

    private static void Accumulate(UserStats stats, DataRow r, DateTime since, DateTime now)
    {
        var created = (DateTime)r["CreatedAt"];
        var status = (string)r["Status"];
        var due = r["DueDate"] as DateTime?;
        var completed = r["CompletedAt"] as DateTime?;

        if (created >= since)
        {
            stats.Assigned++;
            if (r["AcknowledgedAt"] != DBNull.Value) stats.Acked++;
        }
        if (status == "COMPLETED" && completed.HasValue && completed.Value >= since)
        {
            stats.Completed++;
            stats.CompletionHours.Add((completed.Value - created).TotalHours);
            if (due.HasValue)
            {
                stats.CompletedWithDue++;
                if (completed.Value <= due.Value) stats.OnTime++;
            }
        }
        if (status != "COMPLETED")
        {
            stats.Open++;
            if (due.HasValue && due.Value < now) stats.Overdue++;
        }
    }

    private class UserStats
    {
        public string Name;
        public string Dept;
        public int Assigned, Completed, CompletedWithDue, OnTime, Open, Overdue, Acked;
        public List<double> CompletionHours = new List<double>();
    }
}
