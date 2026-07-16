using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Web;
using System.Web.UI.WebControls;

public partial class MeetingsPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!IsPostBack)
        {
            foreach (DataRow r in Db.Query(
                "SELECT Id, Name FROM Users WHERE Active = 1 AND Id <> @me ORDER BY Name", Db.P("@me", Me.Id)).Rows)
                cblUsers.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
            foreach (DataRow r in Db.Query("SELECT Id, Name FROM Departments ORDER BY Name").Rows)
                cblDepartments.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
            Bind();
        }
    }

    protected void btnCreate_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        DateTime starts, ends;
        if (txtTitle.Text.Trim().Length == 0 ||
            !DateTime.TryParse(txtStarts.Text, out starts) || !DateTime.TryParse(txtEnds.Text, out ends) ||
            ends <= starts)
        {
            lblError.Text = "Title, start and end (after start) are required.";
            return;
        }

        var attendees = new HashSet<int>(
            cblUsers.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => int.Parse(i.Value)));
        foreach (var deptItem in cblDepartments.Items.Cast<ListItem>().Where(i => i.Selected))
        {
            foreach (DataRow r in Db.Query(
                "SELECT Id FROM Users WHERE Active = 1 AND DepartmentId = @d",
                Db.P("@d", int.Parse(deptItem.Value))).Rows)
                attendees.Add((int)r["Id"]);
        }
        attendees.Remove(Me.Id);

        var meetingId = Db.Insert(
            @"INSERT INTO Meetings (Title, StartsAt, EndsAt, Location, OrganizerId)
              VALUES (@t, @s, @e, @l, @o)",
            Db.P("@t", txtTitle.Text.Trim()), Db.P("@s", starts.ToUniversalTime()),
            Db.P("@e", ends.ToUniversalTime()),
            Db.P("@l", txtLocation.Text.Trim().Length > 0 ? txtLocation.Text.Trim() : null),
            Db.P("@o", Me.Id));

        foreach (var userId in attendees)
            Db.Exec("INSERT INTO MeetingAttendees (MeetingId, UserId) VALUES (@m, @u)",
                Db.P("@m", meetingId), Db.P("@u", userId));

        NotificationService.Notify(attendees, "meeting_invite",
            Me.Name + " invited you: " + txtTitle.Text.Trim(),
            starts.ToString("yyyy-MM-dd HH:mm") + (txtLocation.Text.Trim().Length > 0 ? " · " + txtLocation.Text.Trim() : ""),
            "Meetings.aspx");

        txtTitle.Text = txtStarts.Text = txtEnds.Text = txtLocation.Text = "";
        foreach (ListItem i in cblUsers.Items) i.Selected = false;
        foreach (ListItem i in cblDepartments.Items) i.Selected = false;
        Bind();
    }

    private void Bind()
    {
        var meetings = Db.Query(
            @"SELECT m.Id, m.Title, m.StartsAt, m.EndsAt, m.Location, m.OrganizerId, o.Name AS OrganizerName
              FROM Meetings m JOIN Users o ON o.Id = m.OrganizerId
              WHERE m.EndsAt > DATEADD(DAY, -14, SYSUTCDATETIME())
              ORDER BY m.StartsAt");

        var items = new List<object>();
        foreach (DataRow m in meetings.Rows)
        {
            var meetingId = (int)m["Id"];
            var attendees = Db.Query(
                @"SELECT ma.UserId, ma.Response, u.Name FROM MeetingAttendees ma
                  JOIN Users u ON u.Id = ma.UserId WHERE ma.MeetingId = @m", Db.P("@m", meetingId));
            var actionItems = Db.Query(
                "SELECT Title, Status FROM Tasks WHERE MeetingId = @m", Db.P("@m", meetingId));

            var mine = attendees.Rows.Cast<DataRow>().FirstOrDefault(r => (int)r["UserId"] == Me.Id);
            var past = (DateTime)m["EndsAt"] < DateTime.UtcNow;

            items.Add(new
            {
                Id = meetingId,
                TitleHtml = HttpUtility.HtmlEncode((string)m["Title"]),
                OrganizerHtml = HttpUtility.HtmlEncode((string)m["OrganizerName"]),
                WhenLabel = ((DateTime)m["StartsAt"]).ToLocalTime().ToString("ddd dd MMM HH:mm") + " – " +
                            ((DateTime)m["EndsAt"]).ToLocalTime().ToString("HH:mm") +
                            (m["Location"] != DBNull.Value ? " · " + HttpUtility.HtmlEncode((string)m["Location"]) : ""),
                AttendeesHtml = string.Join(" ", attendees.Rows.Cast<DataRow>().Select(r =>
                {
                    var css = (string)r["Response"] == "ACCEPTED" ? "chip-completed"
                            : (string)r["Response"] == "DECLINED" ? "chip-urgent" : "chip-notstarted";
                    return "<span class=\"chip " + css + "\">" + HttpUtility.HtmlEncode((string)r["Name"]) + "</span>";
                })),
                ActionItemsHtml = actionItems.Rows.Count == 0 ? "No action items yet." :
                    "Action items: " + string.Join(" · ", actionItems.Rows.Cast<DataRow>().Select(r =>
                        HttpUtility.HtmlEncode((string)r["Title"]) + " (" +
                        TaskService.StatusLabel((string)r["Status"]).ToLowerInvariant() + ")")),
                CanRespond = mine != null && !past
            });
        }
        rptMeetings.DataSource = items;
        rptMeetings.DataBind();
    }

    protected void rptMeetings_ItemCommand(object source, RepeaterCommandEventArgs e)
    {
        var meetingId = int.Parse((string)e.CommandArgument);
        var response = e.CommandName == "Accept" ? "ACCEPTED" : "DECLINED";
        Db.Exec("UPDATE MeetingAttendees SET Response = @r WHERE MeetingId = @m AND UserId = @u",
            Db.P("@r", response), Db.P("@m", meetingId), Db.P("@u", Me.Id));

        var organizer = Db.Scalar("SELECT OrganizerId FROM Meetings WHERE Id = @m", Db.P("@m", meetingId));
        var title = Db.Scalar("SELECT Title FROM Meetings WHERE Id = @m", Db.P("@m", meetingId)) as string;
        if (organizer != null)
            NotificationService.Notify(new[] { (int)organizer }, "meeting_response",
                Me.Name + " " + response.ToLowerInvariant() + " \"" + title + "\"", null, "Meetings.aspx");
        Bind();
    }
}
