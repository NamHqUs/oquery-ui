using Demo.Contracts.Services;
using Microsoft.Extensions.Configuration;
using System.Data;

namespace Demo.DbServices;

public enum DbServerType
{
    Sqlite,
    SqlServer,
    Firebird,
    Postgres,
    Cockroach,
    MySql,
    Oracle,
    Db2
}

public sealed class DbConnectionService(IConfiguration configuration, DatabaseService dbService) : IDbConnectionService
{
    private readonly IReadOnlyDictionary<string, (string Provider, string ConnectionString)> _dbOptions =
        configuration.GetSection("DbOptions")
            .GetChildren()
            .ToDictionary(e => e["Name"]!, e => (e["Provider"]!, e["ConnectionString"]!)) ?? [];

    private readonly bool _directConnectionsEnabled = configuration.GetValue<bool>("DbProvider:AllowDirectConnections");

    DatabaseConnectionOptionsDto IDbConnectionService.GetConnectionOptions()
        => new(
            Enum.GetNames<DbServerType>(),
            _dbOptions.Keys.ToList(),

            _directConnectionsEnabled);

    string? IDbConnectionService.GetCurrentProvider()
        => dbService.GetCurrentProvider();

    string IDbConnectionService.Connect(string profile)
    {
        var (provider, connectionString) = _dbOptions.TryGetValue(profile, out var option)
            ? option
            : throw new KeyNotFoundException($"Database options profile '{profile}' was not found.");

        Connect(provider, connectionString, isDirectConnection: false);
        return provider;
    }
    void IDbConnectionService.Connect(string provider, string connectionString)
        => Connect(provider, connectionString, isDirectConnection: true);

    private void Connect(string provider, string connectionString, bool isDirectConnection)
    {
        if (isDirectConnection && !_directConnectionsEnabled)
            throw new InvalidOperationException("Direct database connections are disabled by the server.");
        
        dbService.Connect(provider, connectionString);
    }

    void IDbConnectionService.Disconnect() => dbService.Disconnect();

    IDbConnection IDbConnectionService.CreateConnection()
        => dbService.CreateConnection();
}
