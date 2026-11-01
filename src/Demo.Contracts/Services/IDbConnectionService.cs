using System.Data;

namespace Demo.Contracts.Services;
public interface IDbConnectionService
{
    IDbConnection CreateConnection();
    DatabaseConnectionOptionsDto GetConnectionOptions();

    string? GetCurrentProvider();

    string Connect(string profile);
    void Connect(string provider, string connectionString);
    void Disconnect();
}

public sealed record DatabaseConnectionOptionsDto(
    IReadOnlyList<string> Providers,
    IReadOnlyList<string> Profiles,
    bool DirectConnectionsEnabled);
