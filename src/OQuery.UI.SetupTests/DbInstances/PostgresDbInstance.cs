using Npgsql;
using System.Data;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public class PostgresDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("Postgres", connectionString, scriptFiles, dbVersion, new PostgresScriptSql())
{
    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new NpgsqlConnection(ConnectionString));
}
