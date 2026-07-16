using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web;

public partial class ChatPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    private int? SelectedChannelId
    {
        get
        {
            int id;
            return int.TryParse(ddlChannel.SelectedValue, out id) ? (int?)id : null;
        }
    }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!IsPostBack)
        {
            BindChannels(null);
            BindDmUsers();
            BindMessages();
        }
    }

    private void BindChannels(int? selectId)
    {
        // My channels (public ones + DMs I'm in), with unread counts.
        var rows = Db.Query(
            @"SELECT c.Id, c.Name, c.ChannelType,
                     other.Name AS DmWith,
                     (SELECT COUNT(*) FROM Messages m
                      WHERE m.ChannelId = c.Id AND m.AuthorId <> @me
                        AND (cm.LastReadAt IS NULL OR m.CreatedAt > cm.LastReadAt)) AS Unread
              FROM Channels c
              JOIN ChannelMembers cm ON cm.ChannelId = c.Id AND cm.UserId = @me
              OUTER APPLY (SELECT TOP 1 u.Name FROM ChannelMembers cm2
                           JOIN Users u ON u.Id = cm2.UserId
                           WHERE cm2.ChannelId = c.Id AND cm2.UserId <> @me
                             AND c.ChannelType = 'DM') other
              ORDER BY c.ChannelType, c.Name", Db.P("@me", Me.Id));

        ddlChannel.Items.Clear();
        foreach (DataRow r in rows.Rows)
        {
            var isDm = (string)r["ChannelType"] == "DM";
            var label = isDm ? "DM: " + (r["DmWith"] as string ?? "direct message") : "# " + (string)r["Name"];
            var unread = (int)r["Unread"];
            if (unread > 0) label += " (" + unread + ")";
            ddlChannel.Items.Add(new System.Web.UI.WebControls.ListItem(label, r["Id"].ToString()));
        }
        if (selectId.HasValue) ddlChannel.SelectedValue = selectId.Value.ToString();
    }

    private void BindDmUsers()
    {
        ddlDmUser.Items.Clear();
        foreach (DataRow r in Db.Query(
            "SELECT Id, Name FROM Users WHERE Active = 1 AND Id <> @me ORDER BY Name", Db.P("@me", Me.Id)).Rows)
        {
            ddlDmUser.Items.Add(new System.Web.UI.WebControls.ListItem((string)r["Name"], r["Id"].ToString()));
        }
    }

    private void BindMessages()
    {
        if (!SelectedChannelId.HasValue) { rptMessages.DataSource = null; rptMessages.DataBind(); return; }
        var channelId = SelectedChannelId.Value;

        var rows = Db.Query(
            @"SELECT TOP 100 m.Id, m.Content, m.CreatedAt, u.Name AS AuthorName,
                     t.Id AS TaskId, t.Status AS TaskStatus
              FROM Messages m
              JOIN Users u ON u.Id = m.AuthorId
              LEFT JOIN Tasks t ON t.SourceMessageId = m.Id
              WHERE m.ChannelId = @c
              ORDER BY m.CreatedAt ASC", Db.P("@c", channelId));

        rptMessages.DataSource = rows.Rows.Cast<DataRow>().Select(r => new
        {
            Id = (int)r["Id"],
            AuthorName = HttpUtility.HtmlEncode((string)r["AuthorName"]),
            TimeLabel = ((DateTime)r["CreatedAt"]).ToLocalTime().ToString("dd MMM HH:mm"),
            ContentHtml = RenderContent((string)r["Content"]),
            HasTask = r["TaskId"] != DBNull.Value,
            TaskLabel = r["TaskId"] != DBNull.Value
                ? "✓ task: " + TaskService.StatusLabel((string)r["TaskStatus"]).ToLowerInvariant()
                : ""
        }).ToList();
        rptMessages.DataBind();

        Db.Exec("UPDATE ChannelMembers SET LastReadAt = SYSUTCDATETIME() WHERE ChannelId = @c AND UserId = @u",
            Db.P("@c", channelId), Db.P("@u", Me.Id));
    }

    /// <summary>HTML-encode, then highlight @tokens.</summary>
    private static string RenderContent(string content)
    {
        var encoded = HttpUtility.HtmlEncode(content ?? "");
        return Regex.Replace(encoded, @"@([a-zA-Z0-9._-]+)", "<span class=\"mention\">@$1</span>");
    }

    protected void ddlChannel_Changed(object sender, EventArgs e) { BindMessages(); }
    protected void tmrRefresh_Tick(object sender, EventArgs e) { BindMessages(); }

    protected void btnSend_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        var content = (txtMessage.Text ?? "").Trim();
        if (content.Length == 0 || !SelectedChannelId.HasValue) return;
        var channelId = SelectedChannelId.Value;

        var channel = Db.Query(
            "SELECT Name, ChannelType, DepartmentId FROM Channels WHERE Id = @c", Db.P("@c", channelId)).Rows[0];

        var messageId = Db.Insert(
            "INSERT INTO Messages (ChannelId, AuthorId, Content) VALUES (@c, @a, @content)",
            Db.P("@c", channelId), Db.P("@a", Me.Id), Db.P("@content", content));

        var isDm = (string)channel["ChannelType"] == "DM";
        var channelLabel = isDm ? "a direct message" : "#" + (string)channel["Name"];
        var mentions = MentionService.Resolve(content, channel["DepartmentId"] as int?);
        MentionService.SaveAndNotify(messageId, mentions, Me.Id, Me.Name, channelLabel, content);

        if (isDm)
        {
            var mentioned = new HashSet<int>(mentions.SelectMany(m => m.UserIds));
            var others = Db.Query(
                "SELECT UserId FROM ChannelMembers WHERE ChannelId = @c AND UserId <> @me",
                Db.P("@c", channelId), Db.P("@me", Me.Id))
                .Rows.Cast<DataRow>().Select(r => (int)r["UserId"]).Where(id => !mentioned.Contains(id));
            NotificationService.Notify(others, "dm", "New message from " + Me.Name,
                content.Length > 140 ? content.Substring(0, 140) : content, "Chat.aspx");
        }

        txtMessage.Text = "";
        BindMessages();
    }

    protected void btnStartDm_Click(object sender, EventArgs e)
    {
        int otherId;
        if (!int.TryParse(ddlDmUser.SelectedValue, out otherId) || otherId == Me.Id) return;

        var dmKey = Math.Min(Me.Id, otherId) + ":" + Math.Max(Me.Id, otherId);
        var existing = Db.Scalar("SELECT Id FROM Channels WHERE DmKey = @k", Db.P("@k", dmKey));
        int channelId;
        if (existing != null)
        {
            channelId = (int)existing;
        }
        else
        {
            channelId = Db.Insert(
                "INSERT INTO Channels (Name, ChannelType, DmKey) VALUES (@n, 'DM', @k)",
                Db.P("@n", dmKey), Db.P("@k", dmKey));
            Db.Exec("INSERT INTO ChannelMembers (ChannelId, UserId) VALUES (@c, @u1), (@c, @u2)",
                Db.P("@c", channelId), Db.P("@u1", Me.Id), Db.P("@u2", otherId));
        }
        BindChannels(channelId);
        BindMessages();
    }
}
