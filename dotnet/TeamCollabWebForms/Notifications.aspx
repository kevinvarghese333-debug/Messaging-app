<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Notifications.aspx.cs" Inherits="NotificationsPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Notifications</h2>
    <p class="subtitle">Mentions, task assignments, reminders, escalations, and meeting invites land here.</p>
    <asp:Repeater ID="rptItems" runat="server">
        <ItemTemplate>
            <div class="card" style='<%# (bool)Eval("IsUnread") ? "border-left: 3px solid #4f46e5;" : "" %>'>
                <a href='<%# Eval("Link") %>'><%# Eval("TitleHtml") %></a>
                <div class="muted"><%# Eval("BodyHtml") %></div>
                <div class="muted"><%# Eval("TimeLabel") %></div>
            </div>
        </ItemTemplate>
    </asp:Repeater>
    <asp:Label ID="lblEmpty" runat="server" CssClass="muted" Visible="false" Text="Nothing yet." />
</asp:Content>
