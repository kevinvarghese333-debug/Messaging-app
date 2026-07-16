using System;
using System.Data;
using System.Linq;
using System.Web;

public partial class NotificationsPage : System.Web.UI.Page
{
    protected void Page_Load(object sender, EventArgs e)
    {
        if (IsPostBack) return;
        var me = AuthHelper.User;

        var rows = Db.Query(
            @"SELECT TOP 50 Title, Body, Link, ReadAt, CreatedAt FROM Notifications
              WHERE UserId = @u ORDER BY CreatedAt DESC", Db.P("@u", me.Id));

        rptItems.DataSource = rows.Rows.Cast<DataRow>().Select(r => new
        {
            TitleHtml = HttpUtility.HtmlEncode((string)r["Title"]),
            BodyHtml = r["Body"] != DBNull.Value ? HttpUtility.HtmlEncode((string)r["Body"]) : "",
            Link = r["Link"] as string ?? "Notifications.aspx",
            TimeLabel = ((DateTime)r["CreatedAt"]).ToLocalTime().ToString("dd MMM yyyy HH:mm"),
            IsUnread = r["ReadAt"] == DBNull.Value
        }).ToList();
        rptItems.DataBind();
        lblEmpty.Visible = rows.Rows.Count == 0;

        Db.Exec("UPDATE Notifications SET ReadAt = SYSUTCDATETIME() WHERE UserId = @u AND ReadAt IS NULL",
            Db.P("@u", me.Id));
    }
}
