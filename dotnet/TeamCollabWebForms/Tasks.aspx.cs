using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using System.Web;
using System.Web.UI.WebControls;

public partial class TasksPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!IsPostBack)
        {
            foreach (DataRow r in Db.Query("SELECT Id, Name FROM Departments ORDER BY Name").Rows)
                ddlDept.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
            ddlDept.Items.Insert(0, new ListItem("Any department", ""));

            foreach (DataRow r in Db.Query("SELECT Id, Name FROM Users WHERE Active = 1 ORDER BY Name").Rows)
                ddlAssignee.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
            ddlAssignee.Items.Insert(0, new ListItem("Any assignee", ""));

            Bind();
        }
    }

    protected void Filters_Changed(object sender, EventArgs e) { Bind(); }

    private void Bind()
    {
        var where = new List<string>();
        var ps = new List<SqlParameter> { Db.P("@me", Me.Id) };

        if (ddlView.SelectedValue == "mine")
            where.Add("EXISTS (SELECT 1 FROM TaskAssignees x WHERE x.TaskId = t.Id AND x.UserId = @me)");
        else if (ddlView.SelectedValue == "assigned-by-me")
            where.Add("t.AssignerId = @me");

        if (ddlStatus.SelectedValue != "") { where.Add("t.Status = @status"); ps.Add(Db.P("@status", ddlStatus.SelectedValue)); }
        if (ddlAssignee.SelectedValue != "")
        {
            where.Add("EXISTS (SELECT 1 FROM TaskAssignees x WHERE x.TaskId = t.Id AND x.UserId = @assignee)");
            ps.Add(Db.P("@assignee", int.Parse(ddlAssignee.SelectedValue)));
        }
        if (ddlDept.SelectedValue != "")
        {
            where.Add(@"EXISTS (SELECT 1 FROM TaskAssignees x JOIN Users xu ON xu.Id = x.UserId
                        WHERE x.TaskId = t.Id AND xu.DepartmentId = @dept)");
            ps.Add(Db.P("@dept", int.Parse(ddlDept.SelectedValue)));
        }

        var sql =
            @"SELECT t.Id, t.Title, t.Description, t.Status, t.Priority, t.DueDate, t.AcknowledgedAt,
                     t.AssignerId, a.Name AS AssignerName, mt.Title AS MeetingTitle
              FROM Tasks t
              JOIN Users a ON a.Id = t.AssignerId
              LEFT JOIN Meetings mt ON mt.Id = t.MeetingId" +
            (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "") +
            @" ORDER BY CASE t.Status WHEN 'NOT_STARTED' THEN 0 WHEN 'DECISION_MAKING' THEN 1
                        WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, t.DueDate, t.CreatedAt DESC";

        var tasks = Db.Query(sql, ps.ToArray());
        var items = new List<object>();
        foreach (DataRow t in tasks.Rows)
        {
            var taskId = (int)t["Id"];
            var assignees = Db.Query(
                @"SELECT u.Name, ta.UserId, ta.ViaLabel FROM TaskAssignees ta
                  JOIN Users u ON u.Id = ta.UserId WHERE ta.TaskId = @t", Db.P("@t", taskId));

            var isAssignee = assignees.Rows.Cast<DataRow>().Any(r => (int)r["UserId"] == Me.Id);
            var status = (string)t["Status"];
            var due = t["DueDate"] as DateTime?;
            var overdue = due.HasValue && status != "COMPLETED" && due.Value < DateTime.UtcNow;

            items.Add(new
            {
                Id = taskId,
                TitleHtml = HttpUtility.HtmlEncode((string)t["Title"]),
                AssignerName = HttpUtility.HtmlEncode((string)t["AssignerName"]),
                StatusLabel = TaskService.StatusLabel(status),
                StatusCss = status == "COMPLETED" ? "chip-completed" : status == "IN_PROGRESS" ? "chip-progress"
                          : status == "DECISION_MAKING" ? "chip-decision" : "chip-notstarted",
                Status = status,
                PriorityLabel = ((string)t["Priority"]).ToLowerInvariant(),
                PriorityCss = "chip-" + ((string)t["Priority"]).ToLowerInvariant(),
                DueLabel = due.HasValue
                    ? (overdue ? " · <span class=\"overdue\">due " + due.Value.ToString("dd MMM HH:mm") + " (overdue)</span>"
                               : " · due " + due.Value.ToString("dd MMM HH:mm"))
                    : "",
                AckLabel = t["AcknowledgedAt"] != DBNull.Value ? " · <span class=\"success\">acknowledged</span>" : "",
                MeetingLabel = t["MeetingTitle"] != DBNull.Value
                    ? " · 📅 " + HttpUtility.HtmlEncode((string)t["MeetingTitle"]) : "",
                AssigneesHtml = string.Join(" ", assignees.Rows.Cast<DataRow>().Select(r =>
                    "<span class=\"chip chip-notstarted\">" + HttpUtility.HtmlEncode((string)r["Name"]) +
                    (r["ViaLabel"] != DBNull.Value ? " <span class=\"muted\">(" + HttpUtility.HtmlEncode((string)r["ViaLabel"]) + ")</span>" : "") +
                    "</span>")),
                CanAck = isAssignee && t["AcknowledgedAt"] == DBNull.Value && status != "COMPLETED",
                CanEdit = isAssignee || (int)t["AssignerId"] == Me.Id || Me.IsAdmin
            });
        }

        rptTasks.DataSource = items;
        rptTasks.DataBind();
        lblEmpty.Visible = items.Count == 0;
    }

    protected void rptTasks_ItemDataBound(object sender, RepeaterItemEventArgs e)
    {
        if (e.Item.ItemType != ListItemType.Item && e.Item.ItemType != ListItemType.AlternatingItem) return;
        var ddl = (DropDownList)e.Item.FindControl("ddlRowStatus");
        if (ddl == null || !ddl.Visible) return;

        dynamic data = e.Item.DataItem;
        foreach (var status in TaskService.Statuses)
            ddl.Items.Add(new ListItem(TaskService.StatusLabel(status), status));
        ddl.SelectedValue = (string)data.Status;
        ddl.Attributes["data-task"] = data.Id.ToString();
    }

    protected void RowStatus_Changed(object sender, EventArgs e)
    {
        var ddl = (DropDownList)sender;
        int taskId = int.Parse(ddl.Attributes["data-task"]);
        TaskService.UpdateStatus(taskId, ddl.SelectedValue, Me.Id, Me.Name);
        Bind();
    }

    protected void rptTasks_ItemCommand(object source, RepeaterCommandEventArgs e)
    {
        if (e.CommandName == "Ack")
        {
            TaskService.Acknowledge(int.Parse((string)e.CommandArgument), Me.Id);
            Bind();
        }
    }
}
