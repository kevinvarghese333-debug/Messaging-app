using System;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;

/// <summary>Thin ADO.NET helper. All SQL is parameterized.</summary>
public static class Db
{
    public static string ConnectionString
    {
        get { return ConfigurationManager.ConnectionStrings["TeamCollab"].ConnectionString; }
    }

    public static SqlParameter P(string name, object value)
    {
        return new SqlParameter(name, value ?? DBNull.Value);
    }

    public static DataTable Query(string sql, params SqlParameter[] ps)
    {
        using (var con = new SqlConnection(ConnectionString))
        using (var cmd = new SqlCommand(sql, con))
        {
            cmd.Parameters.AddRange(ps);
            var table = new DataTable();
            using (var adapter = new SqlDataAdapter(cmd)) adapter.Fill(table);
            return table;
        }
    }

    public static object Scalar(string sql, params SqlParameter[] ps)
    {
        using (var con = new SqlConnection(ConnectionString))
        using (var cmd = new SqlCommand(sql, con))
        {
            cmd.Parameters.AddRange(ps);
            con.Open();
            var result = cmd.ExecuteScalar();
            return result == DBNull.Value ? null : result;
        }
    }

    public static int Exec(string sql, params SqlParameter[] ps)
    {
        using (var con = new SqlConnection(ConnectionString))
        using (var cmd = new SqlCommand(sql, con))
        {
            cmd.Parameters.AddRange(ps);
            con.Open();
            return cmd.ExecuteNonQuery();
        }
    }

    /// <summary>INSERT ... ; returns the new identity value.</summary>
    public static int Insert(string sql, params SqlParameter[] ps)
    {
        var result = Scalar(sql + "; SELECT CAST(SCOPE_IDENTITY() AS INT);", ps);
        return Convert.ToInt32(result);
    }
}
