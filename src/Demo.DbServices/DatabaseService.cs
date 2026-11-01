using Demo.DbServices.DbInstances;
using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.Extensions.Configuration;
using System.Data;

namespace Demo.DbServices;

public class DatabaseService(IConfiguration configuration) : IDatabaseService, IDisposable
{
    private readonly object _instanceLock = new();
    private DbInstance? _currentDbInstance;

    private DbInstance? CurrentDbInstanceOrNull
    {
        get
        {
            if (_currentDbInstance is null)
            {
                var defaultOption = configuration.GetSection("DbProvider:DefaultDbOption");
                if (defaultOption.Exists())
                    _currentDbInstance = CreateDbInstance(defaultOption["Provider"]!, defaultOption["ConnectionString"]!);
            }

            return _currentDbInstance;
        }
    }

    public DbInstance CurrentDbInstance
        => CurrentDbInstanceOrNull ?? throw new InvalidOperationException("A database connection is required.");

    public string? GetCurrentProvider()
        => CurrentDbInstanceOrNull?.Provider.ToString();

    public void Connect(string provider, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(provider);
        ArgumentNullException.ThrowIfNull(connectionString);
        DbInstance? previous;
        lock (_instanceLock)
        {
            previous = _currentDbInstance;
            _currentDbInstance = CreateDbInstance(provider, connectionString);
        }

        if (!ReferenceEquals(previous, _currentDbInstance) && previous is IDisposable disposable)
            disposable.Dispose();
    }

    public void Disconnect()
    {
        // The database instance is shared by all clients, so a client disconnect must not end its lifetime.
    }

    public void Dispose()
    {
        DbInstance? previous;
        lock (_instanceLock)
        {
            previous = _currentDbInstance;
            _currentDbInstance = null;
        }

        if (previous is IDisposable disposable)
            disposable.Dispose();
    }

    public IDbConnection CreateConnection() => CurrentDbInstance.CreateDbConnection();

    public string[] GetTableNames() => CurrentDbInstance.GetTableNames();

    public DatabaseSchemaDto GetDatabaseSchema() => CurrentDbInstance.GetDatabaseSchema();

    public DatabaseTableDataDto GetTableData(string tableName, string? schema = null, int? limit = null)
        => CurrentDbInstance.GetTableData(tableName, schema, limit);

    private DbInstance CreateDbInstance(string provider, string connectionString)
    {
        if (!Enum.TryParse(provider, ignoreCase: true, out DbServerType providerType))
            throw new ArgumentException($"Unsupported database '{provider}'.", nameof(provider));
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new ArgumentException("A connection string is required.", nameof(connectionString));

        var scriptFiles = GetInitializationScripts(provider);
        var dbVersion = configuration["DbProvider:DBVersion"]
            ?? throw new InvalidOperationException("DBVersion is required in the configuration.");
        return providerType switch
        {
            DbServerType.Sqlite => new SqliteDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.SqlServer => new SqlServerDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.Firebird => new FirebirdDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.Postgres => new PostgresDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.Cockroach => new CockroachDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.MySql => new MySqlDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.Oracle => new OracleDbInstance(connectionString, scriptFiles, dbVersion),
            DbServerType.Db2 => new Db2DbInstance(connectionString, scriptFiles, dbVersion),
            _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null)
        };
    }

    private string[] GetInitializationScripts(string provider)
    {
        var path = configuration["DbProvider:DbScriptsPath"]
            ?? throw new InvalidOperationException("DbProvider:DbScriptsPath is required in the configuration.");
        path = new DirectoryInfo(path).FullName;

        var useCases = configuration.GetSection("DbProvider:UseCases").Get<string[]>() ?? [];
        return useCases
            .Select(useCase => Path.Combine(path, $"{useCase}.{provider}.sql".ToLowerInvariant()))
            .Where(fileName => File.Exists(Path.Combine(Environment.CurrentDirectory, fileName)))
            .ToArray();
    }
}
