using OQuery;

namespace OQuery.UI.Api.Database;

public static class DialectModules
{
    public static void RegisterAll()
    {
        SqliteDialectModule.Register();
        SqlServerDialectModule.Register();
        PostgresDialectModule.Register();
        CockroachDialectModule.Register();
        MySqlDialectModule.Register();
        OracleDialectModule.Register();
        Db2DialectModule.Register();
        FirebirdDialectModule.Register();
        SapHanaDialectModule.Register();
    }
}
