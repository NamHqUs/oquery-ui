using System.Data;
using FirebirdSql.Data.FirebirdClient;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public sealed class FirebirdDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("Firebird", connectionString, scriptFiles, dbVersion, new FirebirdScriptSql())
{
    protected override void EnsureDatabaseExists()
    {
    }

    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new FbConnection(ConnectionString));
}
