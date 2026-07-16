using System;
using System.Configuration;
using System.Data;
using System.IO;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Web;

/// <summary>
/// One-time login codes. Delivery: SMTP (configure system.net/mailSettings in
/// web.config) when the user has an email; otherwise codes are appended to
/// App_Data/otp.log so admins can read them out during rollout.
/// </summary>
public static class OtpService
{
    private const int TtlMinutes = 5;
    private const int MaxVerifyAttempts = 5;
    private const int MaxRequestsPerWindow = 3;
    private const int RequestWindowMinutes = 10;

    public static string Normalize(string rawIdentifier)
    {
        var trimmed = (rawIdentifier ?? "").Trim();
        return trimmed.Contains("@") ? trimmed.ToLowerInvariant() : AuthHelper.NormalizePhone(trimmed);
    }

    private static DataRow FindUser(string identifier)
    {
        var byEmail = identifier.Contains("@");
        var rows = Db.Query(
            "SELECT Id, Name, Email, Phone FROM Users WHERE Active = 1 AND " +
            (byEmail ? "Email = @v" : "Phone = @v"), Db.P("@v", identifier));
        return rows.Rows.Count > 0 ? rows.Rows[0] : null;
    }

    /// <summary>Always reports success so callers can't probe which phones/emails exist.
    /// Throws only on rate limit.</summary>
    public static void Request(string rawIdentifier)
    {
        var identifier = Normalize(rawIdentifier);
        if (identifier.Length == 0) return;

        var recent = (int)Db.Scalar(
            @"SELECT COUNT(*) FROM OtpCodes
              WHERE Identifier = @i AND CreatedAt > DATEADD(MINUTE, -@w, SYSUTCDATETIME())",
            Db.P("@i", identifier), Db.P("@w", RequestWindowMinutes));
        if (recent >= MaxRequestsPerWindow)
            throw new InvalidOperationException("Too many codes requested. Wait a few minutes and try again.");

        var user = FindUser(identifier);
        if (user == null) return; // silent

        var code = GenerateCode();
        Db.Exec("UPDATE OtpCodes SET ConsumedAt = SYSUTCDATETIME() WHERE Identifier = @i AND ConsumedAt IS NULL",
            Db.P("@i", identifier));
        Db.Exec(
            @"INSERT INTO OtpCodes (Identifier, CodeHash, ExpiresAt)
              VALUES (@i, @h, DATEADD(MINUTE, @ttl, SYSUTCDATETIME()))",
            Db.P("@i", identifier), Db.P("@h", AuthHelper.Hash("otp", code)), Db.P("@ttl", TtlMinutes));

        Deliver(identifier, code, user["Email"] as string);
    }

    /// <summary>Returns the user's Id on success; throws on any failure.</summary>
    public static int Verify(string rawIdentifier, string code)
    {
        var identifier = Normalize(rawIdentifier);
        var rows = Db.Query(
            @"SELECT TOP 1 Id, CodeHash, Attempts FROM OtpCodes
              WHERE Identifier = @i AND ConsumedAt IS NULL AND ExpiresAt > SYSUTCDATETIME()
              ORDER BY CreatedAt DESC", Db.P("@i", identifier));
        if (rows.Rows.Count == 0) throw new InvalidOperationException("Invalid or expired code");

        var otp = rows.Rows[0];
        if ((int)otp["Attempts"] >= MaxVerifyAttempts) throw new InvalidOperationException("Invalid or expired code");

        if (AuthHelper.Hash("otp", (code ?? "").Trim()) != (string)otp["CodeHash"])
        {
            Db.Exec("UPDATE OtpCodes SET Attempts = Attempts + 1 WHERE Id = @id", Db.P("@id", (int)otp["Id"]));
            throw new InvalidOperationException("Invalid or expired code");
        }

        Db.Exec("UPDATE OtpCodes SET ConsumedAt = SYSUTCDATETIME() WHERE Id = @id", Db.P("@id", (int)otp["Id"]));
        var user = FindUser(identifier);
        if (user == null) throw new InvalidOperationException("Invalid or expired code");
        return (int)user["Id"];
    }

    private static string GenerateCode()
    {
        var bytes = new byte[4];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        var value = BitConverter.ToUInt32(bytes, 0) % 900000u + 100000u;
        return value.ToString();
    }

    private static void Deliver(string identifier, string code, string email)
    {
        var smtpConfigured = ConfigurationManager.AppSettings["SmtpConfigured"] == "true";
        var deliverable = !string.IsNullOrEmpty(email) && !email.EndsWith(".local");

        if (smtpConfigured && deliverable)
        {
            try
            {
                using (var message = new MailMessage())
                {
                    message.To.Add(email);
                    message.Subject = "Your TeamCollab login code";
                    message.Body = "Your login code is " + code + ". It expires in " + TtlMinutes + " minutes.";
                    using (var client = new SmtpClient()) client.Send(message); // settings from web.config
                }
                return;
            }
            catch (Exception ex)
            {
                LogToFile("SMTP delivery failed for " + identifier + ": " + ex.Message);
            }
        }

        // Dev/stopgap: readable by admins on the server.
        LogToFile("Login code for " + identifier + ": " + code);
    }

    private static void LogToFile(string line)
    {
        try
        {
            var path = HttpContext.Current != null
                ? HttpContext.Current.Server.MapPath("~/App_Data/otp.log")
                : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "otp.log");
            File.AppendAllText(path, DateTime.UtcNow.ToString("u") + "  " + line + Environment.NewLine);
        }
        catch { /* never break login over logging */ }
    }
}
