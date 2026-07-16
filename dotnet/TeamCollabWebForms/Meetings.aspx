<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Meetings.aspx.cs" Inherits="MeetingsPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Meetings</h2>
    <p class="subtitle">Invite individuals or whole departments. Attendees get a notification now and a reminder 15 minutes before start. Action items are real tasks linked to the meeting.</p>

    <div class="card" style="max-width: 640px;">
        <strong>Schedule a meeting</strong>
        <p><asp:TextBox ID="txtTitle" runat="server" placeholder="Title" Width="100%" /></p>
        <div class="toolbar">
            <label>Starts: <asp:TextBox ID="txtStarts" runat="server" TextMode="DateTimeLocal" /></label>
            <label>Ends: <asp:TextBox ID="txtEnds" runat="server" TextMode="DateTimeLocal" /></label>
            <asp:TextBox ID="txtLocation" runat="server" placeholder="Location or link (optional)" />
        </div>
        <p><strong>People</strong></p>
        <asp:CheckBoxList ID="cblUsers" runat="server" RepeatColumns="3" CssClass="muted" />
        <p><strong>Whole departments</strong></p>
        <asp:CheckBoxList ID="cblDepartments" runat="server" RepeatDirection="Horizontal" CssClass="muted" />
        <p>
            <asp:Button ID="btnCreate" runat="server" CssClass="btn" OnClick="btnCreate_Click" Text="Schedule" />
            <asp:Label ID="lblError" runat="server" CssClass="error" />
        </p>
    </div>

    <h2 style="margin-top: 20px;">Upcoming &amp; recent</h2>
    <asp:Repeater ID="rptMeetings" runat="server" OnItemCommand="rptMeetings_ItemCommand">
        <ItemTemplate>
            <div class="card">
                <strong><%# Eval("TitleHtml") %></strong>
                <div class="muted"><%# Eval("WhenLabel") %> · organized by <%# Eval("OrganizerHtml") %></div>
                <div style="margin: 6px 0;"><%# Eval("AttendeesHtml") %></div>
                <div class="toolbar">
                    <asp:Button runat="server" CssClass="btn btn-small" Text="Accept"
                        CommandName="Accept" CommandArgument='<%# Eval("Id") %>' Visible='<%# (bool)Eval("CanRespond") %>' />
                    <asp:Button runat="server" CssClass="btn btn-small btn-quiet" Text="Decline"
                        CommandName="Decline" CommandArgument='<%# Eval("Id") %>' Visible='<%# (bool)Eval("CanRespond") %>' />
                    <a class="muted" href='<%# "NewTask.aspx?meetingId=" + Eval("Id") %>'>+ add action item</a>
                </div>
                <div class="muted"><%# Eval("ActionItemsHtml") %></div>
            </div>
        </ItemTemplate>
    </asp:Repeater>
</asp:Content>
