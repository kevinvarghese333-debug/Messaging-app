using System.Collections.Generic;
using System.Linq;

public static class NotificationService
{
    public static void Notify(IEnumerable<int> userIds, string type, string title, string body = null, string link = null)
    {
        foreach (var userId in userIds.Distinct())
        {
            Db.Exec(
                @"INSERT INTO Notifications (UserId, NotifType, Title, Body, Link)
                  VALUES (@u, @t, @title, @body, @link)",
                Db.P("@u", userId), Db.P("@t", type), Db.P("@title", title),
                Db.P("@body", body), Db.P("@link", link));
        }
    }

    public static int UnreadCount(int userId)
    {
        var result = Db.Scalar(
            "SELECT COUNT(*) FROM Notifications WHERE UserId = @u AND ReadAt IS NULL",
            Db.P("@u", userId));
        return result == null ? 0 : (int)result;
    }
}
