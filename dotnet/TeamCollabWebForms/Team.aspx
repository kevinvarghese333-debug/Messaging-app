<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Team.aspx.cs" Inherits="TeamPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>My team</h2>
    <p class="subtitle">People who report to you. Teammates you add sign in with a one-time code sent to their phone/email — no password, no self-signup, nothing to pay.</p>

    <div class="card" style="max-width: 640px;">
        <strong>Add a teammate under you</strong>
        <div class="toolbar" style="margin-top: 8px;">
            <asp:TextBox ID="txtName" runat="server" placeholder="Full name" />
            <asp:TextBox ID="txtPhone" runat="server" placeholder="Mobile number (e.g. +91…)" />
            <asp:TextBox ID="txtEmail" runat="server" TextMode="Email" placeholder="Email (recommended for OTP)" />
            <asp:Button ID="btnAdd" runat="server" CssClass="btn" OnClick="btnAdd_Click" Text="Add teammate" />
        </div>
        <asp:Label ID="lblError" runat="server" CssClass="error" />
        <asp:Label ID="lblSuccess" runat="server" CssClass="success" />
        <p class="muted">They join your department reporting to you; an admin can change role/department/manager later.</p>
    </div>

    <h2 style="margin-top: 20px;">Direct reports</h2>
    <asp:GridView ID="gvTeam" runat="server" AutoGenerateColumns="false" CssClass="grid" GridLines="None">
        <Columns>
            <asp:BoundField HeaderText="Name" DataField="Name" HtmlEncode="true" />
            <asp:BoundField HeaderText="Handle" DataField="Handle" HtmlEncode="true" />
            <asp:BoundField HeaderText="Phone" DataField="Phone" HtmlEncode="true" />
            <asp:BoundField HeaderText="Email" DataField="Email" HtmlEncode="true" />
            <asp:BoundField HeaderText="Role" DataField="Role" HtmlEncode="true" />
            <asp:BoundField HeaderText="Department" DataField="Department" HtmlEncode="true" />
        </Columns>
    </asp:GridView>
    <asp:Label ID="lblEmpty" runat="server" CssClass="muted" Visible="false" Text="Nobody reports to you yet." />
</asp:Content>
