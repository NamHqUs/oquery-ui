using System.Data;
using Oracle.ManagedDataAccess.Client;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public sealed class OracleDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("Oracle", connectionString, scriptFiles, dbVersion, new OracleScriptSql())
{
    protected override void EnsureDatabaseExists()
    {
    }

    protected override bool IsAlreadyExistsException(Exception exception)
        => exception is OracleException oracleException && oracleException.Number == 955;

    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new OracleConnection(ConnectionString));
}
