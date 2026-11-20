using OQuery.Database;
using OQuery.UI.Services.DbSchemaLoaders;
using OQuery.UnitTest.Setup.DbInstances;

namespace OQuery.UI.Application;

/// <summary>
/// Registers the OQuery dialects the sample API ships with. Each dialect is registered explicitly from its
/// OQuery.&lt;Db&gt; project's dialect module, so adding a dialect means adding a project reference and one line here.
/// The host owns provisioning: each factory first runs the database's DbInstance (version table and seed scripts), then returns the schema loader.
/// </summary>
public static class DialectModules
{
    private static readonly Dictionary<string, Func<string, string[], string, DbSchemaLoader>> DbInstanceFactories =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Sqlite"] = (connectionString, scriptFiles, dbVersion) => ProvisionSqlite(connectionString, scriptFiles, dbVersion),
            ["SqlServer"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new SqlServerDbInstance(connectionString, scriptFiles, dbVersion), () => new SqlServerDbSchemaLoader(connectionString, scriptFiles)),
            ["Postgres"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new PostgresDbInstance(connectionString, scriptFiles, dbVersion), () => new PostgresDbSchemaLoader(connectionString, scriptFiles)),
            ["Cockroach"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new CockroachDbInstance(connectionString, scriptFiles, dbVersion), () => new CockroachDbSchemaLoader(connectionString, scriptFiles)),
            ["MySql"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new MySqlDbInstance(connectionString, scriptFiles, dbVersion), () => new MySqlDbSchemaLoader(connectionString, scriptFiles)),
            ["Oracle"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new OracleDbInstance(connectionString, scriptFiles, dbVersion), () => new OracleDbSchemaLoader(connectionString, scriptFiles)),
            ["Db2"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new Db2DbInstance(connectionString, scriptFiles, dbVersion), () => new Db2DbSchemaLoader(connectionString, scriptFiles)),
            ["Firebird"] = (connectionString, scriptFiles, dbVersion) => Provision(() => new FirebirdDbInstance(connectionString, scriptFiles, dbVersion), () => new FirebirdDbSchemaLoader(connectionString, scriptFiles)),
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

    // An in-memory SQLite database gets a generated name per normalization. Normalize once so the seed and the loader share it.
    private static DbSchemaLoader ProvisionSqlite(string connectionString, string[] scriptFiles, string dbVersion)
    {
        var normalized = SqliteDbInstance.NormalizeConnectionString(connectionString);
        return Provision(
            () => new SqliteSeedDbInstance(normalized, scriptFiles, dbVersion),
            () => new SqliteDbSchemaLoader(normalized, scriptFiles));
    }

    // The DbInstance constructor runs the provisioning, so it is created for its side effect before the loader is returned.
    private static DbSchemaLoader Provision(Func<object> provision, Func<DbSchemaLoader> createLoader)
    {
        provision();
        return createLoader();
    }

    private static void Register(string name, Func<ISqlDialect> createDialect, IReadOnlyList<string>? aliases = null)
        => SqlDialectRegistry.Register(new SqlDialectRegistration(
            name,
            createDialect,
            DbInstanceFactories.GetValueOrDefault(name),
            aliases));
}

// Sqlite seed scripts attach in-memory schemas themselves. The loader used to strip those ATTACH statements before seeding,
// because the seeding connection already has the schemas attached.
internal sealed class SqliteSeedDbInstance(string connectionString, string[] scriptFiles, string dbVersion)
    : SqliteDbInstance(connectionString, scriptFiles, dbVersion)
{
    protected override string PrepareInitializationScript(string script)
        => MemoryDatabaseAttachment.Replace(script, string.Empty);
}
