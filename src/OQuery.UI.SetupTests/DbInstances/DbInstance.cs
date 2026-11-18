using System.Data;
using OQuery.Database.Scripts;

namespace OQuery.UnitTest.Setup.DbInstances;

public abstract class DbInstance : ScriptDbInstance
{
    private IDbConnection? _connection;

    protected override int ConnectionAttempts => 60;

    // Test connections are cached and handed to tests, so bootstrap must not dispose them.
    protected override bool DisposeCreatedConnections => false;

    protected DbInstance(string provider, string connectionString, string[] scriptFiles, string dbVersion, ScriptSql sql)
        : base(provider, connectionString, scriptFiles, dbVersion, sql)
    {
    }

    protected IDbConnection GetOrCreateConnection(Func<IDbConnection> factory)
        => _connection ??= factory();

    protected override string ResolveScriptPath(string fileName)
    {
        if (Path.IsPathRooted(fileName))
            return fileName;

        var currentPath = Path.Combine(Environment.CurrentDirectory, fileName);
        if (File.Exists(currentPath))
            return currentPath;

        return Path.Combine(
            new DirectoryInfo(Path.Combine(AppContext.BaseDirectory, "../../../../../")).FullName,
            fileName);
    }
}
