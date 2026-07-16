<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="NewTask.aspx.cs" Inherits="NewTaskPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2><asp:Literal ID="litHeading" runat="server" Text="New task" /></h2>
    <p class="subtitle">Assign to individual people, whole departments, or role groups — group targets expand to every member, each of whom is notified.</p>

    <div class="card" style="max-width: 640px;">
        <asp:Label ID="lblSource" runat="server" CssClass="muted" Visible="false" /><br />
        <p><asp:TextBox ID="txtTitle" runat="server" placeholder="Task title" Width="100%" /></p>
        <p><asp:TextBox ID="txtDescription" runat="server" TextMode="MultiLine" Rows="2" placeholder="Description (optional)" Width="100%" /></p>
        <div class="toolbar">
            <label>Due date: <asp:TextBox ID="txtDueDate" runat="server" TextMode="DateTimeLocal" /></label>
            <label>Priority:
                <asp:DropDownList ID="ddlPriority" runat="server">
                    <asp:ListItem Value="LOW" Text="Low" />
                    <asp:ListItem Value="MEDIUM" Text="Medium" Selected="True" />
                    <asp:ListItem Value="HIGH" Text="High" />
                    <asp:ListItem Value="URGENT" Text="Urgent" />
                </asp:DropDownList>
            </label>
        </div>

        <p><strong>People</strong></p>
        <asp:CheckBoxList ID="cblUsers" runat="server" RepeatColumns="3" CssClass="muted" />
        <p><strong>Whole departments</strong></p>
        <asp:CheckBoxList ID="cblDepartments" runat="server" RepeatDirection="Horizontal" CssClass="muted" />
        <p><strong>Role groups</strong></p>
        <asp:CheckBoxList ID="cblRoles" runat="server" RepeatDirection="Horizontal" CssClass="muted">
            <asp:ListItem Value="MANAGER" Text="All managers" />
            <asp:ListItem Value="DEPT_HEAD" Text="All department heads" />
            <asp:ListItem Value="ADMIN" Text="All admins" />
        </asp:CheckBoxList>

        <p>
            <asp:Button ID="btnCreate" runat="server" CssClass="btn" OnClick="btnCreate_Click" Text="Create task" />
            <a class="btn btn-quiet" href="Tasks.aspx">Cancel</a>
        </p>
        <asp:Label ID="lblError" runat="server" CssClass="error" />
    </div>
</asp:Content>
