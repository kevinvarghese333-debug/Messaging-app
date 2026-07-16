using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Web.UI.WebControls;

public partial class NewTaskPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    private int? SourceMessageId
    {
        get { int id; return int.TryParse(Request.QueryString["messageId"], out id) ? (int?)id : null; }
    }
    private int? MeetingId
    {
        get { int id; return int.TryParse(Request.QueryString["meetingId"], out id) ? (int?)id : null; }
    }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (IsPostBack) return;

        foreach (DataRow r in Db.Query("SELECT Id, Name FROM Users WHERE Active = 1 ORDER BY Name").Rows)
            cblUsers.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
        foreach (DataRow r in Db.Query("SELECT Id, Name FROM Departments ORDER BY Name").Rows)
            cblDepartments.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));

        if (SourceMessageId.HasValue)
        {
            var msg = Db.Query("SELECT Content FROM Messages WHERE Id = @m", Db.P("@m", SourceMessageId.Value));
            if (msg.Rows.Count > 0)
            {
                var content = (string)msg.Rows[0]["Content"];
                litHeading.Text = "Assign message as task";
                lblSource.Visible = true;
                lblSource.Text = "From message: “" + Server.HtmlEncode(
                    content.Length > 140 ? content.Substring(0, 140) : content) + "”";
                txtTitle.Text = content.Length > 100 ? content.Substring(0, 100) : content;
            }
        }
        else if (MeetingId.HasValue)
        {
            litHeading.Text = "Add meeting action item";
        }
    }

    protected void btnCreate_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        if (txtTitle.Text.Trim().Length == 0) { lblError.Text = "Give the task a title."; return; }

        var userIds = cblUsers.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => int.Parse(i.Value)).ToList();
        var deptIds = cblDepartments.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => int.Parse(i.Value)).ToList();
        var roles = cblRoles.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => i.Value).ToList();

        var assignees = TaskService.ResolveAssignees(userIds, deptIds, roles);
        if (assignees.Count == 0)
        {
            lblError.Text = "Pick at least one assignee (person, department, or role group).";
            return;
        }

        DateTime due;
        DateTime? dueDate = DateTime.TryParse(txtDueDate.Text, out due)
            ? (DateTime?)due.ToUniversalTime() : null;

        TaskService.Create(Me.Id, Me.Name, txtTitle.Text.Trim(),
            txtDescription.Text.Trim().Length > 0 ? txtDescription.Text.Trim() : null,
            dueDate, ddlPriority.SelectedValue, SourceMessageId, MeetingId, assignees);

        Response.Redirect(MeetingId.HasValue ? "~/Meetings.aspx" : "~/Tasks.aspx");
    }
}
