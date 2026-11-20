namespace OQuery.UI.Hosting;

/// <summary>
/// Backend settings. <c>AddOQuery</c> binds the "OQuery" configuration section first, then applies the caller's lambda.
/// The property shape mirrors the configuration keys, so a key such as "OQuery:DbProvider:Provider" maps to <see cref="DbProviderOptions.Provider"/>.
/// </summary>
public sealed class OQueryOptions
{
    public const string ConfigurationSection = "OQuery";

    public RepositoryOptions Repositories { get; set; } = new();
    public DbProviderOptions DbProvider { get; set; } = new();
    public SeedOptions Seeds { get; set; } = new();
    public AnalyticsOptions Analytics { get; set; } = new();

    public sealed class RepositoryOptions
    {
        public FileRepositoryOptions Files { get; set; } = new();
    }

    public sealed class FileRepositoryOptions
    {
        /// <summary>Folder that stores each user section's domains, queries and function definitions. Relative paths resolve against the current directory.</summary>
        public string? UserData { get; set; }
    }

    public sealed class DbProviderOptions
    {
        /// <summary>Provider name of the default database, for example "SqlServer" or "Sqlite".</summary>
        public string? Provider { get; set; }

        /// <summary>Connection string of the default database. Both <see cref="Provider"/> and this value must be set to connect on startup.</summary>
        public string? ConnectionString { get; set; }

        /// <summary>When false, PUT /db/connection is rejected.</summary>
        public bool AllowDirectConnection { get; set; } = true;
    }

    public sealed class SeedOptions
    {
        public bool Enabled { get; set; }
        public string? DBVersion { get; set; }
        public string[]? DataSets { get; set; }

        /// <summary>Folder that contains the built-in seed data sets.</summary>
        public string? BasePath { get; set; }
    }

    public sealed class AnalyticsOptions
    {
        /// <summary>Connection string of the analytics store. Falls back to ConnectionStrings:Analytics. Analytics is disabled when empty.</summary>
        public string? ConnectionString { get; set; }

        public int FlushIntervalSeconds { get; set; } = 60;

        public bool IsEnabled => !string.IsNullOrWhiteSpace(ConnectionString);
    }
}
