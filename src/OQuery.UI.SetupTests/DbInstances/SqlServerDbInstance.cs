using Microsoft.Data.SqlClient;
using System.Data;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public class SqlServerDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("SqlServer", connectionString, scriptFiles, dbVersion, new SqlServerScriptSql())
{
    public override bool TestConnection()
    {
        try
        {
            using var connection = new SqlConnection(ConnectionString);
            connection.Open();
            return true;
        }
        catch (SqlException exception) when (exception.Number == 4060)
        {
            var masterConnectionString = new SqlConnectionStringBuilder(ConnectionString)
            {
                InitialCatalog = "master"
            };

            try
            {
                using var connection = new SqlConnection(masterConnectionString.ConnectionString);
                connection.Open();
                return true;
            }
            catch (SqlException)
            {
                return false;
            }
        }
        catch (SqlException)
        {
            return false;
        }
    }

    protected override void EnsureDatabaseExists()
    {
        var targetDatabase = new SqlConnectionStringBuilder(ConnectionString).InitialCatalog;
        if (string.IsNullOrWhiteSpace(targetDatabase))
            throw new InvalidOperationException("SQL Server test connection must specify a database.");

        var masterConnectionString = new SqlConnectionStringBuilder(ConnectionString)
        {
            InitialCatalog = "master"
        };

        using (var connection = new SqlConnection(masterConnectionString.ConnectionString))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = """
                IF DB_ID(@DatabaseName) IS NULL
                BEGIN
                    DECLARE @CreateDatabase nvarchar(258) =
                        N'CREATE DATABASE ' + QUOTENAME(@DatabaseName);
                    EXEC sys.sp_executesql @CreateDatabase;
                END;
                """;
            command.Parameters.AddWithValue("@DatabaseName", targetDatabase);
            command.ExecuteNonQuery();
        }

        base.EnsureDatabaseExists();
    }

    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new SqlConnection(ConnectionString));
}
