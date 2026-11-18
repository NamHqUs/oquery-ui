using Npgsql;
using System.Data;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public sealed class CockroachDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("Cockroach", connectionString, scriptFiles, dbVersion, new PostgresScriptSql())
{
    public override IDbConnection CreateDbConnection()
    {
        return GetOrCreateConnection(() =>
        {
            var connection = new NpgsqlConnection(ConnectionString);
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "SET search_path = main, hr, sa, he, \"in\", public;";
            command.ExecuteNonQuery();
            return connection;
        });
    }
}
