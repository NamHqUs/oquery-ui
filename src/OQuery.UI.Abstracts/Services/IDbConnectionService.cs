using System.Data;

namespace OQuery.UI.Abstracts.Services;
public interface IDbConnectionService
{
    IDbConnection CreateConnection();
    DatabaseConnectionOptionsDto GetConnectionOptions();

    string? GetCurrentProvider();

    void UpdateDbConnection(string provider, string connectionString);
    void Disconnect();
}

public sealed record DatabaseConnectionOptionsDto(IReadOnlyList<string> Providers);
