<%@ Application Language="C#" %>
<script runat="server">
    void Application_Start(object sender, EventArgs e)
    {
        // Background reminders: due-soon, overdue, manager escalation, meeting alerts.
        ReminderScheduler.Start();
    }
</script>
