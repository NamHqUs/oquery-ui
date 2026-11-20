using OQuery.Database;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Hosting;
using Microsoft.Extensions.Options;
using System.Data;

namespace OQuery.UI.Services;

/// <summary>
/// Creates a short-lived schema loader for a project's connection. It does not touch <see cref="DatabaseService"/>,
/// so the shared default connection stays unchanged.
/// </summary>
public sealed class ProjectDatabaseSchemaLoader(IOptions<OQueryOptions> options) : IProjectDatabaseSchemaLoader
{
    public void TestConnection(string provider, string connectionString)
    {
        var loader = CreateLoader(provider, connectionString);
        using IDbConnection connection = loader.CreateDbConnection();
        connection.Open();
    }

    /// <summary>
    /// An in-memory SQLite database starts empty, so when seeding is enabled it is provisioned with the seed scripts first.
    /// File databases are never seeded, because the scripts drop and recreate tables in the target database.
    /// </summary>
    public DatabaseSchema LoadSchema(string provider, string connectionString)
        => ShouldSeed(provider, connectionString)
            ? CreateSeededLoader(provider, connectionString).LoadSchema()
            : CreateLoader(provider, connectionString).LoadSchema();

    private bool ShouldSeed(string provider, string connectionString)
        => options.Value.Seeds.Enabled
            && provider.Trim().Equals("Sqlite", StringComparison.OrdinalIgnoreCase)
            && connectionString.Contains(":memory:", StringComparison.OrdinalIgnoreCase);

    private DbSchemaLoader CreateSeededLoader(string provider, string connectionString)
    {
        var seeds = options.Value.Seeds;
        var dbVersion = seeds.DBVersion
            ?? throw new InvalidOperationException("OQuery:Seeds:DBVersion is required in the configuration.");
        var dataSets = seeds.DataSets
            ?? throw new InvalidOperationException("OQuery:Seeds:DataSets is required in the configuration.");
        var scripts = BuiltinDataLoader.GetScripts(seeds.BasePath, dataSets, provider.Trim()).ToArray();
        return SqlDialectRegistry.CreateDbInstance(provider.Trim(), connectionString, scripts, dbVersion);
    }

    private static DbSchemaLoader CreateLoader(string provider, string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        return SqlDialectRegistry.CreateSchemaLoader(provider.Trim(), connectionString);
    }
}
