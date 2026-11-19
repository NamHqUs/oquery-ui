using OQuery.UI.Abstracts.Services;
using System.Data;

namespace OQuery.UI.Api.Services;

public sealed class DbConnectionService(DatabaseService dbService) : IDbConnectionService
{
    DatabaseConnectionOptionsDto IDbConnectionService.GetConnectionOptions()
        => new(OQuery.Database.SqlDialectRegistry.RegisteredNames.ToArray());

    string? IDbConnectionService.GetCurrentProvider()
        => dbService.GetCurrentProvider();

    void IDbConnectionService.UpdateDbConnection(string provider, string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        if (!OQuery.Database.SqlDialectRegistry.RegisteredNames.Contains(provider, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException($"Database provider '{provider}' is not available. Register its dialect in DialectModules.RegisterAll.", nameof(provider));

        dbService.Connect(provider, connectionString);
    }

    void IDbConnectionService.Disconnect() => dbService.Disconnect();

    IDbConnection IDbConnectionService.CreateConnection()
        => dbService.CreateConnection();
}
