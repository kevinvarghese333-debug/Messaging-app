<%@ Page Language="C#" MasterPageFile="~/Site.master" CodeFile="Chat.aspx.cs" Inherits="ChatPage" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
    <h2>Chat</h2>
    <p class="subtitle">Mention people with @handle, departments with @slug (e.g. @engineering), leadership with @managers or @dept-heads, or @everyone.</p>

    <div class="toolbar">
        <asp:DropDownList ID="ddlChannel" runat="server" AutoPostBack="true" OnSelectedIndexChanged="ddlChannel_Changed" />
        <span class="muted">or message someone directly:</span>
        <asp:DropDownList ID="ddlDmUser" runat="server" />
        <asp:Button ID="btnStartDm" runat="server" CssClass="btn btn-small btn-quiet" OnClick="btnStartDm_Click" Text="Open DM" />
    </div>

    <asp:UpdatePanel ID="upChat" runat="server">
        <ContentTemplate>
            <asp:Timer ID="tmrRefresh" runat="server" Interval="5000" OnTick="tmrRefresh_Tick" />
            <div class="chat-messages">
                <asp:Repeater ID="rptMessages" runat="server">
                    <ItemTemplate>
                        <div class="chat-message">
                            <span class="chat-author"><%# Eval("AuthorName") %></span>
                            <span class="chat-time"><%# Eval("TimeLabel") %></span>
                            <asp:HyperLink runat="server" CssClass="muted" Text="✓ assign as task"
                                NavigateUrl='<%# "~/NewTask.aspx?messageId=" + Eval("Id") %>'
                                Visible='<%# !(bool)Eval("HasTask") %>' />
                            <asp:HyperLink runat="server" CssClass="muted"
                                NavigateUrl='<%# "~/Tasks.aspx" %>' Text='<%# Eval("TaskLabel") %>'
                                Visible='<%# (bool)Eval("HasTask") %>' />
                            <div class="chat-content"><%# Eval("ContentHtml") %></div>
                        </div>
                    </ItemTemplate>
                </asp:Repeater>
            </div>

            <div class="toolbar" style="margin-top: 10px;">
                <asp:TextBox ID="txtMessage" runat="server" TextMode="MultiLine" Rows="2" Width="70%" />
                <asp:Button ID="btnSend" runat="server" CssClass="btn" OnClick="btnSend_Click" Text="Send" />
            </div>
            <asp:Label ID="lblError" runat="server" CssClass="error" />
        </ContentTemplate>
        <Triggers>
            <asp:AsyncPostBackTrigger ControlID="tmrRefresh" EventName="Tick" />
        </Triggers>
    </asp:UpdatePanel>
</asp:Content>
