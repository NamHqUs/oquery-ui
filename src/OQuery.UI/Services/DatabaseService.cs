using OQuery;
using OQuery.Database;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Hosting;
using OQuery.UI.Services;
using Microsoft.Extensions.Options;
using System.Data;

namespace OQuery.UI.Services;

public class DatabaseService(IOptions<OQueryOptions> options) : IDatabaseService, IDisposable
{
    private readonly object _instanceLock = new();
    private DbSchemaLoader? _currentDbInstance;

    private DbSchemaLoader? CurrentDbInstanceOrNull
    {
        get
        {
            lock (_instanceLock)
            {
                if (_currentDbInstance is null)
                {
                    var defaultProvider = options.Value.DbProvider.Provider;
                    var defaultConnectionString = options.Value.DbProvider.ConnectionString;
                    if (!string.IsNullOrWhiteSpace(defaultProvider) && !string.IsNullOrWhiteSpace(defaultConnectionString))
                        _currentDbInstance = CreateDbInstance(defaultProvider, defaultConnectionString);
                }

                return _currentDbInstance;
            }
        }
    }

    public DbSchemaLoader CurrentDbInstance
        => CurrentDbInstanceOrNull ?? throw new InvalidOperationException("A database connection is required.");

    public string? GetCurrentProvider()
        => CurrentDbInstanceOrNull?.Provider.ToString();

    public void Connect(string provider, string connectionString)
    {
        ArgumentNullException.ThrowIfNull(provider);
        ArgumentNullException.ThrowIfNull(connectionString);
        DbSchemaLoader? previous;
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
        DbSchemaLoader? previous;
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

    private DbSchemaLoader CreateDbInstance(string provider, string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new ArgumentException("A connection string is required.", nameof(connectionString));

        var scriptFiles = GetInitializationScripts(provider);
        var dbVersion = options.Value.Seeds.DBVersion
            ?? throw new InvalidOperationException("OQuery:Seeds:DBVersion is required in the configuration.");
        return SqlDialectRegistry.CreateDbInstance(provider, connectionString, scriptFiles, dbVersion);
    }

    private string[] GetInitializationScripts(string provider)
    {
        var seeds = options.Value.Seeds;
        if (!seeds.Enabled)
            return [];

        var dataSets = seeds.DataSets
            ?? throw new InvalidOperationException("OQuery:Seeds:DataSets is required in the configuration.");
        return BuiltinDataLoader.GetScripts(seeds.BasePath, dataSets, provider).ToArray();
    }
}
