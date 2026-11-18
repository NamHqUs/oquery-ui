using IBM.Data.Db2;
using System.Data;
using OQuery.Database.Scripts;

using OQuery.UnitTest.Setup;

namespace OQuery.UnitTest.Setup.DbInstances;

public sealed class Db2DbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : DbInstance("Db2", connectionString, scriptFiles, dbVersion, new Db2ScriptSql())
{
    protected override void EnsureDatabaseExists()
    {
    }

    protected override bool IsAlreadyExistsException(Exception exception)
        => exception is DB2Exception db2Exception
            && db2Exception.Message.Contains("SQL0601N", StringComparison.Ordinal);

    public override IDbConnection CreateDbConnection()
        => GetOrCreateConnection(() => new DB2Connection(ConnectionString));
}
