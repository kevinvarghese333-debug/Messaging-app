using System;
using System.Data;

public partial class RegisterPage : System.Web.UI.Page
{
    protected void btnRegister_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        var name = txtName.Text.Trim();
        var email = txtEmail.Text.Trim().ToLowerInvariant();
        var phone = AuthHelper.NormalizePhone(txtPhone.Text);

        if (name.Length == 0 || email.Length == 0 || txtPassword.Text.Length < 8 || !AuthHelper.IsValidPhone(phone))
        {
            lblError.Text = "Fill in every field: valid phone (7-15 digits) and a password of at least 8 characters.";
            return;
        }

        var clash = Db.Scalar("SELECT 1 FROM Users WHERE Email = @e OR Phone = @p",
            Db.P("@e", email), Db.P("@p", phone));
        if (clash != null)
        {
            lblError.Text = "An account with this email or phone already exists.";
            return;
        }

        var isFirst = (int)Db.Scalar("SELECT COUNT(*) FROM Users") == 0;
        var salt = AuthHelper.NewSalt();
        var userId = Db.Insert(
            @"INSERT INTO Users (Name, Handle, Email, Phone, PasswordSalt, PasswordHash, RoleLevel)
              VALUES (@n, @h, @e, @p, @salt, @hash, @role)",
            Db.P("@n", name), Db.P("@h", AuthHelper.UniqueHandle(name)), Db.P("@e", email),
            Db.P("@p", phone), Db.P("@salt", salt), Db.P("@hash", AuthHelper.Hash(salt, txtPassword.Text)),
            Db.P("@role", isFirst ? "ADMIN" : "MEMBER"));

        // Join all public channels so chat works immediately.
        foreach (DataRow r in Db.Query("SELECT Id FROM Channels WHERE ChannelType = 'PUBLIC'").Rows)
        {
            Db.Exec("INSERT INTO ChannelMembers (ChannelId, UserId) VALUES (@c, @u)",
                Db.P("@c", (int)r["Id"]), Db.P("@u", userId));
        }

        AuthHelper.SignIn(userId);
        Response.Redirect("~/Chat.aspx");
    }
}
