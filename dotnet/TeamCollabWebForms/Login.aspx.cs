using System;

public partial class LoginPage : System.Web.UI.Page
{
    protected void btnTabOtp_Click(object sender, EventArgs e)
    {
        pnlOtpRequest.Visible = true;
        pnlOtpVerify.Visible = false;
        pnlPassword.Visible = false;
        lblError.Text = "";
    }

    protected void btnTabPassword_Click(object sender, EventArgs e)
    {
        pnlOtpRequest.Visible = false;
        pnlOtpVerify.Visible = false;
        pnlPassword.Visible = true;
        lblError.Text = "";
    }

    protected void btnSendCode_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        try
        {
            OtpService.Request(txtIdentifier.Text);
            ViewState["Identifier"] = txtIdentifier.Text.Trim();
            litIdentifier.Text = Server.HtmlEncode(txtIdentifier.Text.Trim());
            pnlOtpRequest.Visible = false;
            pnlOtpVerify.Visible = true;
        }
        catch (InvalidOperationException ex) { lblError.Text = ex.Message; }
    }

    protected void btnVerify_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        try
        {
            var userId = OtpService.Verify((string)ViewState["Identifier"], txtCode.Text);
            AuthHelper.SignIn(userId);
            Response.Redirect("~/Chat.aspx");
        }
        catch (InvalidOperationException ex)
        {
            lblError.Text = ex.Message;
            pnlOtpVerify.Visible = true;
            pnlOtpRequest.Visible = false;
        }
    }

    protected void btnBack_Click(object sender, EventArgs e)
    {
        pnlOtpVerify.Visible = false;
        pnlOtpRequest.Visible = true;
        txtCode.Text = "";
        lblError.Text = "";
    }

    protected void btnSignIn_Click(object sender, EventArgs e)
    {
        lblError.Text = "";
        pnlPassword.Visible = true;
        pnlOtpRequest.Visible = false;

        var rows = Db.Query(
            "SELECT Id, PasswordSalt, PasswordHash, Active FROM Users WHERE Email = @e",
            Db.P("@e", txtEmail.Text.Trim().ToLowerInvariant()));
        if (rows.Rows.Count == 0)
        {
            lblError.Text = "Invalid email or password";
            return;
        }
        var user = rows.Rows[0];
        if (user["PasswordHash"] == DBNull.Value)
        {
            lblError.Text = "This account uses OTP login — switch to the OTP tab";
            return;
        }
        var hash = AuthHelper.Hash((string)user["PasswordSalt"], txtPassword.Text);
        if (hash != (string)user["PasswordHash"])
        {
            lblError.Text = "Invalid email or password";
            return;
        }
        if (!(bool)user["Active"])
        {
            lblError.Text = "This account has been deactivated";
            return;
        }
        AuthHelper.SignIn((int)user["Id"]);
        Response.Redirect("~/Chat.aspx");
    }
}
