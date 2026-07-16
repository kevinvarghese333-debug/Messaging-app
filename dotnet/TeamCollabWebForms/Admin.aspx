<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Admin.aspx.cs" Inherits="AdminPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Admin</h2>
    <p class="subtitle">Departments and reporting lines drive @mentions, group task assignment, and overdue-task escalation.</p>

    <div class="card" style="max-width: 640px;">
        <strong>Departments</strong>
        <div class="toolbar" style="margin-top: 8px;">
            <asp:TextBox ID="txtDeptName" runat="server" placeholder="New department name" />
            <asp:Button ID="btnAddDept" runat="server" CssClass="btn btn-small" OnClick="btnAddDept_Click" Text="Add" />
            <asp:Label ID="lblDeptMsg" runat="server" CssClass="error" />
        </div>
        <asp:Repeater ID="rptDepts" runat="server" OnItemDataBound="rptDepts_ItemDataBound" OnItemCommand="rptDepts_ItemCommand">
            <ItemTemplate>
                <div class="toolbar" style="margin: 4px 0;">
                    <strong style="min-width: 130px;"><%# Eval("NameHtml") %></strong>
                    <span class="muted">@<%# Eval("Slug") %> · <%# Eval("MemberCount") %> people · head:</span>
                    <asp:DropDownList runat="server" ID="ddlHead" />
                    <asp:Button runat="server" CssClass="btn btn-small btn-quiet" Text="Save head"
                        CommandName="SetHead" CommandArgument='<%# Eval("Id") %>' />
                </div>
            </ItemTemplate>
        </asp:Repeater>
    </div>

    <h2 style="margin-top: 20px;">People, roles &amp; hierarchy</h2>
    <asp:Repeater ID="rptUsers" runat="server" OnItemDataBound="rptUsers_ItemDataBound" OnItemCommand="rptUsers_ItemCommand">
        <HeaderTemplate>
            <table class="grid">
                <tr><th>Name</th><th>Role level</th><th>Department</th><th>Reports to</th><th>Active</th><th></th></tr>
        </HeaderTemplate>
        <ItemTemplate>
            <tr>
                <td><strong><%# Eval("NameHtml") %></strong><br />
                    <span class="muted">@<%# Eval("Handle") %> · <%# Eval("Contact") %></span></td>
                <td><asp:DropDownList runat="server" ID="ddlRole" /></td>
                <td><asp:DropDownList runat="server" ID="ddlDept" /></td>
                <td><asp:DropDownList runat="server" ID="ddlManager" /></td>
                <td><asp:CheckBox runat="server" ID="chkActive" /></td>
                <td><asp:Button runat="server" CssClass="btn btn-small" Text="Save"
                        CommandName="SaveUser" CommandArgument='<%# Eval("Id") %>' /></td>
            </tr>
        </ItemTemplate>
        <FooterTemplate></table></FooterTemplate>
    </asp:Repeater>
    <asp:Label ID="lblUserMsg" runat="server" CssClass="error" />
</asp:Content>
