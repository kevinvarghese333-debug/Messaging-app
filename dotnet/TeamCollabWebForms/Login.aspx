<%@ Page Language="C#" CodeFile="Login.aspx.cs" Inherits="LoginPage" %>
<!DOCTYPE html>
<html>
<head runat="server">
    <title>Sign in — TeamCollab</title>
    <link rel="stylesheet" href="Styles/site.css" />
</head>
<body>
    <form id="form1" runat="server">
        <div class="auth-wrap">
            <div class="card">
                <h2>TeamCollab</h2>
                <p class="subtitle">Chat across departments, assign work, never drop a task.</p>

                <div class="toolbar">
                    <asp:LinkButton ID="btnTabOtp" runat="server" CssClass="btn btn-small" OnClick="btnTabOtp_Click" Text="Login with OTP" />
                    <asp:LinkButton ID="btnTabPassword" runat="server" CssClass="btn btn-small btn-quiet" OnClick="btnTabPassword_Click" Text="Password" />
                </div>

                <asp:Panel ID="pnlOtpRequest" runat="server" DefaultButton="btnSendCode">
                    <p><asp:TextBox ID="txtIdentifier" runat="server" placeholder="Phone number or email" Width="100%" /></p>
                    <asp:Button ID="btnSendCode" runat="server" CssClass="btn" OnClick="btnSendCode_Click" Text="Send login code" />
                </asp:Panel>

                <asp:Panel ID="pnlOtpVerify" runat="server" Visible="false" DefaultButton="btnVerify">
                    <p class="muted">We sent a 6-digit code for <asp:Literal ID="litIdentifier" runat="server" />.
                       (No email/SMS configured yet? The code is in App_Data/otp.log on the server.)</p>
                    <p><asp:TextBox ID="txtCode" runat="server" placeholder="6-digit code" MaxLength="6" Width="100%" /></p>
                    <asp:Button ID="btnVerify" runat="server" CssClass="btn" OnClick="btnVerify_Click" Text="Verify &amp; sign in" />
                    <asp:LinkButton ID="btnBack" runat="server" OnClick="btnBack_Click" Text="Use a different number" />
                </asp:Panel>

                <asp:Panel ID="pnlPassword" runat="server" Visible="false" DefaultButton="btnSignIn">
                    <p><asp:TextBox ID="txtEmail" runat="server" TextMode="Email" placeholder="Email" Width="100%" /></p>
                    <p><asp:TextBox ID="txtPassword" runat="server" TextMode="Password" placeholder="Password" Width="100%" /></p>
                    <asp:Button ID="btnSignIn" runat="server" CssClass="btn" OnClick="btnSignIn_Click" Text="Sign in" />
                </asp:Panel>

                <p><asp:Label ID="lblError" runat="server" CssClass="error" /></p>
                <p class="muted">New here? <a href="Register.aspx">Create an account</a> — the first account becomes the admin.</p>
            </div>
        </div>
    </form>
</body>
</html>
