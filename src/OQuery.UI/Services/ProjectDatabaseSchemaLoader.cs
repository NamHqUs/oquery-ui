using OQuery.Database;
using OQuery.UI.Abstracts.Services;
using System.Data;

namespace OQuery.UI.Services;

/// <summary>
/// Creates a short-lived schema loader for a project's connection. It does not provision seed data and
/// does not touch <see cref="DatabaseService"/>, so the shared default connection stays unchanged.
/// </summary>
public sealed class ProjectDatabaseSchemaLoader : IProjectDatabaseSchemaLoader
{
    public void TestConnection(string provider, string connectionString)
    {
        var loader = CreateLoader(provider, connectionString);
        using IDbConnection connection = loader.CreateDbConnection();
        connection.Open();
    }

    public DatabaseSchema LoadSchema(string provider, string connectionString)
        => CreateLoader(provider, connectionString).LoadSchema();

    private static DbSchemaLoader CreateLoader(string provider, string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        return SqlDialectRegistry.CreateSchemaLoader(provider.Trim(), connectionString);
    }
}
