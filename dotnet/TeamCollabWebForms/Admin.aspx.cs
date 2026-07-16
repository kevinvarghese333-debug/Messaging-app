using System;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web;
using System.Web.UI.WebControls;

public partial class AdminPage : System.Web.UI.Page
{
    private CurrentUser Me { get { return AuthHelper.User; } }

    protected void Page_Load(object sender, EventArgs e)
    {
        if (!Me.IsAdmin) { Response.Redirect("~/Chat.aspx"); return; }
        if (!IsPostBack) Bind();
    }

    private void Bind()
    {
        rptDepts.DataSource = Db.Query(
            @"SELECT d.Id, d.Name, d.Slug, d.HeadId,
                     (SELECT COUNT(*) FROM Users u WHERE u.DepartmentId = d.Id AND u.Active = 1) AS MemberCount
              FROM Departments d ORDER BY d.Name")
            .Rows.Cast<DataRow>().Select(r => new
            {
                Id = (int)r["Id"],
                NameHtml = HttpUtility.HtmlEncode((string)r["Name"]),
                Slug = (string)r["Slug"],
                MemberCount = (int)r["MemberCount"],
                HeadId = r["HeadId"] as int?
            }).ToList();
        rptDepts.DataBind();

        rptUsers.DataSource = Db.Query(
            @"SELECT Id, Name, Handle, Email, Phone, RoleLevel, DepartmentId, ManagerId, Active
              FROM Users ORDER BY Name")
            .Rows.Cast<DataRow>().Select(r => new
            {
                Id = (int)r["Id"],
                NameHtml = HttpUtility.HtmlEncode((string)r["Name"]),
                Handle = (string)r["Handle"],
                Contact = HttpUtility.HtmlEncode(
                    (((string)r["Email"]).EndsWith(".local") ? "no email" : (string)r["Email"]) +
                    (r["Phone"] != DBNull.Value ? " · " + (string)r["Phone"] : "")),
                RoleLevel = (string)r["RoleLevel"],
                DepartmentId = r["DepartmentId"] as int?,
                ManagerId = r["ManagerId"] as int?,
                Active = (bool)r["Active"]
            }).ToList();
        rptUsers.DataBind();
    }

    protected void rptDepts_ItemDataBound(object sender, RepeaterItemEventArgs e)
    {
        if (e.Item.ItemType != ListItemType.Item && e.Item.ItemType != ListItemType.AlternatingItem) return;
        dynamic data = e.Item.DataItem;
        var ddl = (DropDownList)e.Item.FindControl("ddlHead");
        ddl.Items.Add(new ListItem("— none —", ""));
        foreach (DataRow r in Db.Query("SELECT Id, Name FROM Users WHERE Active = 1 ORDER BY Name").Rows)
            ddl.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
        if (data.HeadId != null) ddl.SelectedValue = data.HeadId.ToString();
    }

    protected void rptDepts_ItemCommand(object source, RepeaterCommandEventArgs e)
    {
        if (e.CommandName != "SetHead") return;
        var deptId = int.Parse((string)e.CommandArgument);
        var ddl = (DropDownList)e.Item.FindControl("ddlHead");
        int headId;
        if (int.TryParse(ddl.SelectedValue, out headId))
        {
            Db.Exec("UPDATE Departments SET HeadId = @h WHERE Id = @d", Db.P("@h", headId), Db.P("@d", deptId));
            Db.Exec("UPDATE Users SET RoleLevel = 'DEPT_HEAD', DepartmentId = @d WHERE Id = @h",
                Db.P("@d", deptId), Db.P("@h", headId));
        }
        else
        {
            Db.Exec("UPDATE Departments SET HeadId = NULL WHERE Id = @d", Db.P("@d", deptId));
        }
        Bind();
    }

    protected void btnAddDept_Click(object sender, EventArgs e)
    {
        lblDeptMsg.Text = "";
        var name = txtDeptName.Text.Trim();
        if (name.Length == 0) return;
        var slug = Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');

        var clash = Db.Scalar("SELECT 1 FROM Departments WHERE Name = @n OR Slug = @s",
            Db.P("@n", name), Db.P("@s", slug));
        if (clash != null) { lblDeptMsg.Text = "A department with this name already exists."; return; }

        var deptId = Db.Insert("INSERT INTO Departments (Name, Slug) VALUES (@n, @s)",
            Db.P("@n", name), Db.P("@s", slug));
        // Every department gets a channel; members are added as users join the dept.
        Db.Exec("INSERT INTO Channels (Name, ChannelType, DepartmentId) VALUES (@s, 'PUBLIC', @d)",
            Db.P("@s", slug), Db.P("@d", deptId));
        txtDeptName.Text = "";
        Bind();
    }

    protected void rptUsers_ItemDataBound(object sender, RepeaterItemEventArgs e)
    {
        if (e.Item.ItemType != ListItemType.Item && e.Item.ItemType != ListItemType.AlternatingItem) return;
        dynamic data = e.Item.DataItem;

        var ddlRole = (DropDownList)e.Item.FindControl("ddlRole");
        foreach (var role in new[] { "MEMBER", "MANAGER", "DEPT_HEAD", "ADMIN" })
            ddlRole.Items.Add(new ListItem(role.Replace("_", " ").ToLowerInvariant(), role));
        ddlRole.SelectedValue = (string)data.RoleLevel;

        var ddlDept = (DropDownList)e.Item.FindControl("ddlDept");
        ddlDept.Items.Add(new ListItem("— none —", ""));
        foreach (DataRow r in Db.Query("SELECT Id, Name FROM Departments ORDER BY Name").Rows)
            ddlDept.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
        if (data.DepartmentId != null) ddlDept.SelectedValue = data.DepartmentId.ToString();

        var ddlManager = (DropDownList)e.Item.FindControl("ddlManager");
        ddlManager.Items.Add(new ListItem("— none —", ""));
        foreach (DataRow r in Db.Query(
            "SELECT Id, Name FROM Users WHERE Active = 1 AND Id <> @id ORDER BY Name",
            Db.P("@id", (int)data.Id)).Rows)
            ddlManager.Items.Add(new ListItem((string)r["Name"], r["Id"].ToString()));
        if (data.ManagerId != null) ddlManager.SelectedValue = data.ManagerId.ToString();

        ((CheckBox)e.Item.FindControl("chkActive")).Checked = (bool)data.Active;
    }

    protected void rptUsers_ItemCommand(object source, RepeaterCommandEventArgs e)
    {
        if (e.CommandName != "SaveUser") return;
        lblUserMsg.Text = "";
        var userId = int.Parse((string)e.CommandArgument);

        var ddlManager = (DropDownList)e.Item.FindControl("ddlManager");
        int managerId;
        var hasManager = int.TryParse(ddlManager.SelectedValue, out managerId);
        if (hasManager && managerId == userId)
        {
            lblUserMsg.Text = "A user cannot be their own manager.";
            return;
        }

        int deptId;
        var hasDept = int.TryParse(((DropDownList)e.Item.FindControl("ddlDept")).SelectedValue, out deptId);

        Db.Exec(
            @"UPDATE Users SET RoleLevel = @r, DepartmentId = @d, ManagerId = @m, Active = @a WHERE Id = @id",
            Db.P("@r", ((DropDownList)e.Item.FindControl("ddlRole")).SelectedValue),
            Db.P("@d", hasDept ? (object)deptId : null),
            Db.P("@m", hasManager ? (object)managerId : null),
            Db.P("@a", ((CheckBox)e.Item.FindControl("chkActive")).Checked),
            Db.P("@id", userId));
        Bind();
    }
}
