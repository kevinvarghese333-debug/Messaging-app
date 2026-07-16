using System;
using System.Web.Security;

public partial class SiteMaster : System.Web.UI.MasterPage
{
    protected void Page_Load(object sender, EventArgs e)
    {
        var user = AuthHelper.User;
        if (user == null)
        {
            FormsAuthentication.SignOut();
            Response.Redirect("~/Login.aspx");
            return;
        }

        lblMe.Text = Server.HtmlEncode(user.Name) + " · " +
            user.RoleLevel.Replace("_", " ").ToLowerInvariant() +
            (user.DepartmentName != null ? " · " + Server.HtmlEncode(user.DepartmentName) : "");

        lnkTeam.Visible = user.CanManageTeam;
        lnkAdmin.Visible = user.IsAdmin;

        var unread = NotificationService.UnreadCount(user.Id);
        lblUnread.Visible = unread > 0;
        lblUnread.Text = unread.ToString();
    }

    protected void btnLogout_Click(object sender, EventArgs e)
    {
        FormsAuthentication.SignOut();
        Response.Redirect("~/Login.aspx");
    }
}
