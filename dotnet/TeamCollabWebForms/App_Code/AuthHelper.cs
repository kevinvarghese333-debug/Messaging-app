using System;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using System.Web.Security;

public class CurrentUser
{
    public int Id;
    public string Name;
    public string Handle;
    public string Email;
    public string Phone;
    public string RoleLevel;
    public int? DepartmentId;
    public string DepartmentName;
    public int? ManagerId;

    public bool IsAdmin { get { return RoleLevel == "ADMIN"; } }
    public bool CanManageTeam
    {
        get { return RoleLevel == "ADMIN" || RoleLevel == "DEPT_HEAD" || RoleLevel == "MANAGER"; }
    }
}

public static class AuthHelper
{
    public static string NewSalt()
    {
        var bytes = new byte[16];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
    }

    public static string Hash(string salt, string value)
    {
        using (var sha = SHA256.Create())
        {
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(salt + value));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
    }

    public static void SignIn(int userId)
    {
        FormsAuthentication.SetAuthCookie(userId.ToString(), false);
    }

    /// <summary>The signed-in user, loaded once per request.</summary>
    public static CurrentUser User
    {
        get
        {
            var ctx = HttpContext.Current;
            if (ctx == null || !ctx.Request.IsAuthenticated) return null;
            var cached = ctx.Items["CurrentUser"] as CurrentUser;
            if (cached != null) return cached;

            int userId;
            if (!int.TryParse(ctx.User.Identity.Name, out userId)) return null;

            var rows = Db.Query(
                @"SELECT u.Id, u.Name, u.Handle, u.Email, u.Phone, u.RoleLevel,
                         u.DepartmentId, u.ManagerId, d.Name AS DepartmentName
                  FROM Users u LEFT JOIN Departments d ON d.Id = u.DepartmentId
                  WHERE u.Id = @id AND u.Active = 1", Db.P("@id", userId));
            if (rows.Rows.Count == 0) return null;

            var r = rows.Rows[0];
            var user = new CurrentUser
            {
                Id = (int)r["Id"],
                Name = (string)r["Name"],
                Handle = (string)r["Handle"],
                Email = (string)r["Email"],
                Phone = r["Phone"] as string,
                RoleLevel = (string)r["RoleLevel"],
                DepartmentId = r["DepartmentId"] as int?,
                DepartmentName = r["DepartmentName"] as string,
                ManagerId = r["ManagerId"] as int?
            };
            ctx.Items["CurrentUser"] = user;
            return user;
        }
    }

    public static string NormalizePhone(string raw)
    {
        var cleaned = Regex.Replace(raw ?? "", @"[^\d+]", "");
        if (cleaned.StartsWith("+")) cleaned = "+" + cleaned.Substring(1).Replace("+", "");
        return cleaned;
    }

    public static bool IsValidPhone(string raw)
    {
        return Regex.IsMatch(NormalizePhone(raw), @"^\+?\d{7,15}$");
    }

    /// <summary>kevin, kevin2, kevin3… — unique mention handle from a display name.</summary>
    public static string UniqueHandle(string name)
    {
        var baseHandle = Regex.Replace((name ?? "user").ToLowerInvariant(), @"[^a-z0-9]+", ".").Trim('.');
        if (baseHandle.Length == 0) baseHandle = "user";
        var handle = baseHandle;
        for (int i = 2; ; i++)
        {
            var exists = Db.Scalar("SELECT 1 FROM Users WHERE Handle = @h", Db.P("@h", handle));
            if (exists == null) return handle;
            handle = baseHandle + i;
        }
    }
}
