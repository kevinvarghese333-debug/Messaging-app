using System;
using System.Data;
using System.Linq;

public partial class TeamPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!Me.CanManageTeam) { Response.Redirect("~/Chat.aspx"); return; }
        if (!IsPostBack) Bind();
    }

    protected void btnAdd_Click(object sender, EventArgs e)
    {
        lblError.Text = lblSuccess.Text = "";
        var name = txtName.Text.Trim();
        var phone = AuthHelper.NormalizePhone(txtPhone.Text);
        var email = txtEmail.Text.Trim().ToLowerInvariant();

        if (name.Length == 0 || !AuthHelper.IsValidPhone(phone))
        {
            lblError.Text = "Name and a valid phone number (7-15 digits) are required.";
            return;
        }

        var handle = AuthHelper.UniqueHandle(name);
        if (email.Length == 0) email = handle + "@pending.local"; // placeholder keeps Email unique

        var clash = Db.Scalar("SELECT 1 FROM Users WHERE Phone = @p OR Email = @e",
            Db.P("@p", phone), Db.P("@e", email));
        if (clash != null)
        {
            lblError.Text = "Someone already has this phone number or email.";
            return;
        }

        var userId = Db.Insert(
            @"INSERT INTO Users (Name, Handle, Email, Phone, RoleLevel, DepartmentId, ManagerId, InvitedById)
              VALUES (@n, @h, @e, @p, 'MEMBER', @dept, @manager, @manager)",
            Db.P("@n", name), Db.P("@h", handle), Db.P("@e", email), Db.P("@p", phone),
            Db.P("@dept", Me.DepartmentId), Db.P("@manager", Me.Id));

        foreach (DataRow r in Db.Query("SELECT Id FROM Channels WHERE ChannelType = 'PUBLIC'").Rows)
            Db.Exec("INSERT INTO ChannelMembers (ChannelId, UserId) VALUES (@c, @u)",
                Db.P("@c", (int)r["Id"]), Db.P("@u", userId));

        lblSuccess.Text = name + " added — they can log in now with an OTP sent to " + phone + ".";
        txtName.Text = txtPhone.Text = txtEmail.Text = "";
        Bind();
    }

    private void Bind()
    {
        var rows = Db.Query(
            @"SELECT u.Name, u.Handle, u.Phone, u.Email, u.RoleLevel, d.Name AS DeptName
              FROM Users u LEFT JOIN Departments d ON d.Id = u.DepartmentId
              WHERE u.ManagerId = @me ORDER BY u.Name", Db.P("@me", Me.Id));

        gvTeam.DataSource = rows.Rows.Cast<DataRow>().Select(r => new
        {
            Name = (string)r["Name"],
            Handle = "@" + (string)r["Handle"],
            Phone = r["Phone"] as string ?? "—",
            Email = ((string)r["Email"]).EndsWith(".local") ? "—" : (string)r["Email"],
            Role = ((string)r["RoleLevel"]).Replace("_", " ").ToLowerInvariant(),
            Department = r["DeptName"] as string ?? "—"
        }).ToList();
        gvTeam.DataBind();
        lblEmpty.Visible = rows.Rows.Count == 0;
    }
}
