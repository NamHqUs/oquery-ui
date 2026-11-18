using OQuery;
using OQuery.Database;
using OQuery.UI.Api.Services.DbSchemaLoaders;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using OQuery.UnitTest.Setup;
using Microsoft.Extensions.Configuration;
using System.Data;

namespace OQuery.UI.Api.Services;

public class DatabaseService(IConfiguration configuration) : IDatabaseService, IDisposable
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
                    var defaultProvider = configuration["OQuery:DbProvider:Provider"];
                    var defaultConnectionString = configuration["OQuery:DbProvider:ConnectionString"];
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
        var dbVersion = configuration["OQuery:Seeds:DBVersion"]
            ?? throw new InvalidOperationException("OQuery:Seeds:DBVersion is required in the configuration.");
        return SqlDialectRegistry.CreateDbInstance(provider, connectionString, scriptFiles, dbVersion);
    }

    private string[] GetInitializationScripts(string provider)
    {
        if (!configuration.GetValue<bool>("OQuery:Seeds:Enabled"))
            return [];

        var dataSets = configuration.GetSection("OQuery:Seeds:DataSets").Get<string[]>()
            ?? throw new InvalidOperationException("OQuery:Seeds:DataSets is required in the configuration.");
        return BuiltinDataLoader.GetScripts(configuration["OQuery:Seeds:BasePath"], dataSets, provider).ToArray();
    }
}
