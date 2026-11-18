using System.Data;
using MySqlConnector;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public sealed class MySqlDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("MySql", connectionString, scriptFiles, dbVersion, new MySqlScriptSql())
{
    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new MySqlConnection(ConnectionString));
}
