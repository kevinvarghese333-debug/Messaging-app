using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.RegularExpressions;

public class ResolvedMention
{
    public string TargetType;   // USER | DEPARTMENT | ROLE_LEVEL | EVERYONE
    public int? TargetId;
    public string TargetLabel;
    public List<int> UserIds = new List<int>();
}

/// <summary>
/// Resolves @tokens in a message: @handle (person), @engineering (department slug),
/// @managers / @dept-heads / @admins (role level, scoped to the channel's department
/// when it has one), @everyone.
/// </summary>
public static class MentionService
{
    private static readonly Dictionary<string, string[]> RoleGroups = new Dictionary<string, string[]>
    {
        { "managers",   new[] { "MANAGER",   "Managers" } },
        { "dept-heads", new[] { "DEPT_HEAD", "Department heads" } },
        { "heads",      new[] { "DEPT_HEAD", "Department heads" } },
        { "admins",     new[] { "ADMIN",     "Admins" } },
    };

    public static List<string> ExtractTokens(string content)
    {
        var tokens = new List<string>();
        foreach (Match m in Regex.Matches(content ?? "", @"(^|[\s(])@([a-z0-9][a-z0-9._-]*)", RegexOptions.IgnoreCase))
        {
            var token = m.Groups[2].Value.ToLowerInvariant().TrimEnd('.', ',', ';', ':', '!', '?');
            if (!tokens.Contains(token)) tokens.Add(token);
        }
        return tokens;
    }

    public static List<ResolvedMention> Resolve(string content, int? channelDepartmentId)
    {
        var resolved = new List<ResolvedMention>();
        foreach (var token in ExtractTokens(content))
        {
            if (token == "everyone" || token == "all")
            {
                var mention = new ResolvedMention { TargetType = "EVERYONE", TargetLabel = "everyone" };
                foreach (DataRow r in Db.Query("SELECT Id FROM Users WHERE Active = 1").Rows)
                    mention.UserIds.Add((int)r["Id"]);
                resolved.Add(mention);
                continue;
            }

            if (RoleGroups.ContainsKey(token))
            {
                var group = RoleGroups[token];
                var sql = "SELECT Id FROM Users WHERE Active = 1 AND RoleLevel = @r";
                var ps = new List<System.Data.SqlClient.SqlParameter> { Db.P("@r", group[0]) };
                if (channelDepartmentId.HasValue)
                {
                    sql += " AND DepartmentId = @d";
                    ps.Add(Db.P("@d", channelDepartmentId.Value));
                }
                var mention = new ResolvedMention { TargetType = "ROLE_LEVEL", TargetLabel = group[1] };
                foreach (DataRow r in Db.Query(sql, ps.ToArray()).Rows) mention.UserIds.Add((int)r["Id"]);
                resolved.Add(mention);
                continue;
            }

            var dept = Db.Query("SELECT Id, Name FROM Departments WHERE Slug = @s", Db.P("@s", token));
            if (dept.Rows.Count > 0)
            {
                var mention = new ResolvedMention
                {
                    TargetType = "DEPARTMENT",
                    TargetId = (int)dept.Rows[0]["Id"],
                    TargetLabel = (string)dept.Rows[0]["Name"]
                };
                foreach (DataRow r in Db.Query(
                    "SELECT Id FROM Users WHERE Active = 1 AND DepartmentId = @d",
                    Db.P("@d", mention.TargetId.Value)).Rows)
                    mention.UserIds.Add((int)r["Id"]);
                resolved.Add(mention);
                continue;
            }

            var user = Db.Query("SELECT Id, Name FROM Users WHERE Active = 1 AND Handle = @h", Db.P("@h", token));
            if (user.Rows.Count > 0)
            {
                resolved.Add(new ResolvedMention
                {
                    TargetType = "USER",
                    TargetId = (int)user.Rows[0]["Id"],
                    TargetLabel = (string)user.Rows[0]["Name"],
                    UserIds = new List<int> { (int)user.Rows[0]["Id"] }
                });
            }
            // unknown tokens are just text
        }
        return resolved;
    }

    /// <summary>Store mention rows and notify everyone mentioned (except the author).</summary>
    public static void SaveAndNotify(int messageId, List<ResolvedMention> mentions,
        int authorId, string authorName, string channelLabel, string preview)
    {
        var toNotify = new HashSet<int>();
        foreach (var mention in mentions)
        {
            Db.Exec(
                @"INSERT INTO Mentions (MessageId, TargetType, TargetId, TargetLabel)
                  VALUES (@m, @t, @id, @label)",
                Db.P("@m", messageId), Db.P("@t", mention.TargetType),
                Db.P("@id", mention.TargetId), Db.P("@label", mention.TargetLabel));
            foreach (var userId in mention.UserIds) toNotify.Add(userId);
        }
        toNotify.Remove(authorId);
        NotificationService.Notify(toNotify, "mention",
            authorName + " mentioned you in " + channelLabel,
            preview != null && preview.Length > 140 ? preview.Substring(0, 140) : preview,
            "Chat.aspx");
    }
}
