using OQuery.UI.Api.Services.DbSchemaLoaders;

namespace OQuery.Database;

public sealed record SqlDialectRegistration(
    string Name,
    Func<ISqlDialect> CreateDialect,
    Func<string, string[], string, DbSchemaLoader>? CreateDbInstance = null,
    IReadOnlyList<string>? Aliases = null);

public static class SqlDialectRegistry
{
    private static readonly object Gate = new();
    private static readonly List<SqlDialectRegistration> Registrations = [];

    public static void Register(SqlDialectRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        lock (Gate)
        {
            Registrations.RemoveAll(existing => string.Equals(existing.Name, registration.Name, StringComparison.OrdinalIgnoreCase));
            Registrations.Add(registration);
        }
    }

    public static IReadOnlyList<string> RegisteredNames
    {
        get
        {
            lock (Gate)
                return Registrations.Select(registration => registration.Name).ToArray();
        }
    }

    public static IReadOnlyList<ISqlDialect> CreateAllDialects()
    {
        SqlDialectRegistration[] snapshot;
        lock (Gate)
            snapshot = Registrations.ToArray();
        return snapshot.Select(registration => registration.CreateDialect()).ToArray();
    }

    public static ISqlDialect CreateForProvider(string provider)
    {
        var registration = FindByProvider(provider)
            ?? throw new ArgumentException(
                $"Unsupported database provider '{provider}'. Register its OQuery dialect module before use.",
                nameof(provider));
        return registration.CreateDialect();
    }

    public static DbSchemaLoader CreateDbInstance(string provider, string connectionString, string[] scriptFiles, string dbVersion)
    {
        var registration = FindByProvider(provider)
            ?? throw new ArgumentException($"Unsupported database '{provider}'.", nameof(provider));
        return (registration.CreateDbInstance ?? throw new ArgumentException(
                $"Database '{provider}' does not support provisioning.", nameof(provider)))
            (connectionString, scriptFiles, dbVersion);
    }

    private static SqlDialectRegistration? FindByProvider(string provider)
    {
        if (string.IsNullOrWhiteSpace(provider))
            return null;

        SqlDialectRegistration[] snapshot;
        lock (Gate)
            snapshot = Registrations.ToArray();

        return snapshot.FirstOrDefault(registration =>
            string.Equals(registration.Name, provider.Trim(), StringComparison.OrdinalIgnoreCase)
            || (registration.Aliases?.Any(alias => string.Equals(alias, provider.Trim(), StringComparison.OrdinalIgnoreCase)) ?? false));
    }
}
