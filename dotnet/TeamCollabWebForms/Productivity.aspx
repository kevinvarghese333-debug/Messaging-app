<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Productivity.aspx.cs" Inherits="ProductivityPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Productivity</h2>
    <p class="subtitle">On-time = completed before the due date (tasks without due dates aren't counted). Ack rate = share of assigned tasks the person acknowledged.</p>

    <div class="toolbar">
        <asp:DropDownList ID="ddlDays" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed">
            <asp:ListItem Value="7" Text="Last 7 days" />
            <asp:ListItem Value="30" Text="Last 30 days" Selected="True" />
            <asp:ListItem Value="90" Text="Last 90 days" />
        </asp:DropDownList>
        <asp:DropDownList ID="ddlDept" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed" />
    </div>

    <div class="stat-tiles">
        <div class="stat-tile"><div class="label">Completed</div><div class="value"><asp:Literal ID="litCompleted" runat="server" /></div></div>
        <div class="stat-tile"><div class="label">On-time rate</div><div class="value"><asp:Literal ID="litOnTime" runat="server" /></div></div>
        <div class="stat-tile"><div class="label">Avg completion time</div><div class="value"><asp:Literal ID="litAvg" runat="server" /></div></div>
        <div class="stat-tile"><div class="label">Overdue right now</div><div class="value"><asp:Literal ID="litOverdue" runat="server" /></div></div>
    </div>

    <asp:GridView ID="gvUsers" runat="server" AutoGenerateColumns="false" CssClass="grid" GridLines="None">
        <Columns>
            <asp:BoundField HeaderText="Person" DataField="Person" HtmlEncode="true" />
            <asp:BoundField HeaderText="Department" DataField="Department" HtmlEncode="true" />
            <asp:BoundField HeaderText="Assigned" DataField="Assigned" />
            <asp:BoundField HeaderText="Completed" DataField="Completed" />
            <asp:BoundField HeaderText="On-time" DataField="OnTime" />
            <asp:BoundField HeaderText="Avg time" DataField="AvgTime" />
            <asp:BoundField HeaderText="Open" DataField="Open" />
            <asp:BoundField HeaderText="Overdue" DataField="Overdue" />
            <asp:BoundField HeaderText="Ack rate" DataField="AckRate" />
        </Columns>
    </asp:GridView>
</asp:Content>
