using OQuery;
using OQuery.Database;
using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using Microsoft.Extensions.Configuration;
using System.Data;

namespace OQuery.UI.Api.Database;

public class DatabaseService(IConfiguration configuration) : IDatabaseService, IDisposable
{
    private readonly object _instanceLock = new();
    private DbInstance? _currentDbInstance;

    private DbInstance? CurrentDbInstanceOrNull
    {
        get
        {
            lock (_instanceLock)
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

    public DatabaseSchemaDto GetDatabaseSchema() => CurrentDbInstance.GetDatabaseSchema();

    public DatabaseTableDataDto GetTableData(string tableName, string? schema = null, int? limit = null)
        => CurrentDbInstance.GetTableData(tableName, schema, limit);

    private DbInstance CreateDbInstance(string provider, string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new ArgumentException("A connection string is required.", nameof(connectionString));

        var scriptFiles = GetInitializationScripts(provider);
        var dbVersion = configuration["Setup:DBVersion"]
            ?? throw new InvalidOperationException("Setup:DBVersion is required in the configuration.");
        return SqlDialectRegistry.CreateDbInstance(provider, connectionString, scriptFiles, dbVersion);
    }

    private string[] GetInitializationScripts(string provider)
    {
        var rootDirectory = BuiltinDatasets.GetRootDirectory(configuration["Setup:BuiltinPath"]);
        var dataSets = configuration.GetSection("Setup:DataSets").Get<string[]>() ?? [];
        return dataSets
            .Select(dataSet => BuiltinDatasets.GetScriptPath(rootDirectory, dataSet, provider))
            .Where(File.Exists)
            .ToArray();
    }
}
