<%@ Page Language="C#" CodeFile="Register.aspx.cs" Inherits="RegisterPage" %>
<!DOCTYPE html>
<html>
<head runat="server">
    <title>Create account — TeamCollab</title>
    <link rel="stylesheet" href="Styles/site.css" />
</head>
<body>
    <form id="form1" runat="server">
        <div class="auth-wrap">
            <div class="card">
                <h2>Create your account</h2>
                <p class="subtitle">The first account registered becomes the workspace admin.</p>
                <p><asp:TextBox ID="txtName" runat="server" placeholder="Full name" Width="100%" /></p>
                <p><asp:TextBox ID="txtEmail" runat="server" TextMode="Email" placeholder="Email" Width="100%" /></p>
                <p><asp:TextBox ID="txtPhone" runat="server" placeholder="Mobile number (for OTP login)" Width="100%" /></p>
                <p><asp:TextBox ID="txtPassword" runat="server" TextMode="Password" placeholder="Password (min 8 characters)" Width="100%" /></p>
                <asp:Button ID="btnRegister" runat="server" CssClass="btn" OnClick="btnRegister_Click" Text="Create account" />
                <p><asp:Label ID="lblError" runat="server" CssClass="error" /></p>
                <p class="muted"><a href="Login.aspx">Back to sign in</a></p>
            </div>
        </div>
    </form>
</body>
</html>
