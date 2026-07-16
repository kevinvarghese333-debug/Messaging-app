<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Tasks.aspx.cs" Inherits="TasksPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Tasks</h2>
    <p class="subtitle">Who's assigned what, at every stage. Acknowledge a task to confirm you've seen it — unacknowledged overdue tasks escalate to your manager.</p>

    <div class="toolbar">
        <asp:DropDownList ID="ddlView" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed">
            <asp:ListItem Value="mine" Text="My tasks" />
            <asp:ListItem Value="assigned-by-me" Text="Assigned by me" />
            <asp:ListItem Value="all" Text="Everyone (who's assigned what)" />
        </asp:DropDownList>
        <asp:DropDownList ID="ddlStatus" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed">
            <asp:ListItem Value="" Text="Any status" />
            <asp:ListItem Value="NOT_STARTED" Text="Not yet started" />
            <asp:ListItem Value="DECISION_MAKING" Text="Decision making" />
            <asp:ListItem Value="IN_PROGRESS" Text="In progress" />
            <asp:ListItem Value="COMPLETED" Text="Completed" />
        </asp:DropDownList>
        <asp:DropDownList ID="ddlDept" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed" />
        <asp:DropDownList ID="ddlAssignee" runat="server" AutoPostBack="true" OnSelectedIndexChanged="Filters_Changed" />
        <a class="btn" href="NewTask.aspx">+ New task</a>
    </div>

    <asp:Repeater ID="rptTasks" runat="server" OnItemDataBound="rptTasks_ItemDataBound" OnItemCommand="rptTasks_ItemCommand">
        <ItemTemplate>
            <div class="card">
                <strong><%# Eval("TitleHtml") %></strong>
                <span class='<%# "chip " + Eval("PriorityCss") %>'><%# Eval("PriorityLabel") %></span>
                <span class='<%# "chip " + Eval("StatusCss") %>'><%# Eval("StatusLabel") %></span>
                <div class="muted" style="margin: 4px 0;">
                    by <%# Eval("AssignerName") %><%# Eval("DueLabel") %><%# Eval("AckLabel") %><%# Eval("MeetingLabel") %>
                </div>
                <div><%# Eval("AssigneesHtml") %></div>
                <div class="toolbar" style="margin: 8px 0 0;">
                    <asp:Button runat="server" CssClass="btn btn-small btn-quiet" Text="Acknowledge"
                        CommandName="Ack" CommandArgument='<%# Eval("Id") %>' Visible='<%# (bool)Eval("CanAck") %>' />
                    <asp:DropDownList runat="server" ID="ddlRowStatus" AutoPostBack="true"
                        OnSelectedIndexChanged="RowStatus_Changed" Visible='<%# (bool)Eval("CanEdit") %>' />
                </div>
            </div>
        </ItemTemplate>
    </asp:Repeater>
    <asp:Label ID="lblEmpty" runat="server" CssClass="muted" Visible="false" Text="No tasks match these filters." />
</asp:Content>
