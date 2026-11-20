using OQuery.Database;
using OQuery.UI.Api.Services.DbSchemaLoaders;

namespace OQuery.UI.Application;

/// <summary>
/// Registers the OQuery dialects the API ships with. Each dialect is registered explicitly from its
/// OQuery.&lt;Db&gt; project's dialect module, so adding a dialect means adding a project reference and one line here.
/// Provisioning (DbSchemaLoader) is owned by the API, so the factories below are keyed by provider name.
/// </summary>
public static class DialectModules
{
    private static readonly Dictionary<string, Func<string, string[], string, DbSchemaLoader>> DbInstanceFactories =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Sqlite"] = (connectionString, scriptFiles, dbVersion) => new SqliteDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["SqlServer"] = (connectionString, scriptFiles, dbVersion) => new SqlServerDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Postgres"] = (connectionString, scriptFiles, dbVersion) => new PostgresDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Cockroach"] = (connectionString, scriptFiles, dbVersion) => new CockroachDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["MySql"] = (connectionString, scriptFiles, dbVersion) => new MySqlDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Oracle"] = (connectionString, scriptFiles, dbVersion) => new OracleDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Db2"] = (connectionString, scriptFiles, dbVersion) => new Db2DbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Firebird"] = (connectionString, scriptFiles, dbVersion) => new FirebirdDbSchemaLoader(connectionString, scriptFiles, dbVersion),
        };

    /// <summary>Registers every dialect shipped with the API. Safe to call more than once.</summary>
    public static void RegisterAll()
    {
        Register("Cockroach", CockroachDialectModule.CreateDialect, CockroachDialectModule.ProviderAliases);
        Register("Db2", Db2DialectModule.CreateDialect);
        Register("Firebird", FirebirdDialectModule.CreateDialect);
        Register("MySql", MySqlDialectModule.CreateDialect, MySqlDialectModule.ProviderAliases);
        Register("Oracle", OracleDialectModule.CreateDialect);
        Register("Postgres", PostgresDialectModule.CreateDialect, PostgresDialectModule.ProviderAliases);
        Register("SapHana", SapHanaDialectModule.CreateDialect, SapHanaDialectModule.ProviderAliases);
        Register("Sqlite", SqliteDialectModule.CreateDialect);
        Register("SqlServer", SqlServerDialectModule.CreateDialect);
    }

    private static void Register(string name, Func<ISqlDialect> createDialect, IReadOnlyList<string>? aliases = null)
        => SqlDialectRegistry.Register(new SqlDialectRegistration(
            name,
            createDialect,
            DbInstanceFactories.GetValueOrDefault(name),
            aliases));
}
