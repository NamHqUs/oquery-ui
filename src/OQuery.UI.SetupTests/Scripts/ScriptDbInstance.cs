using System.Data;
using System.Globalization;
using System.Text.RegularExpressions;

namespace OQuery.Database.Scripts;

/// <summary>
/// Creates the versions and tracked-tables bookkeeping, then runs initialization scripts once per connection string and version.
/// </summary>
public abstract class ScriptDbInstance
{
    private static readonly HashSet<string> InitializedDatabases = [];
    private static readonly object InitializationLock = new();

    public readonly string Provider;
    protected readonly string ConnectionString;
    protected readonly string[] InitializationScripts;
    protected readonly string DbVersion;
    protected readonly ScriptSql Sql;

    protected virtual int ConnectionAttempts => 1;
    protected virtual int ConnectionRetryDelayMilliseconds => 1000;

    // Connections created during bootstrap are disposed unless a subclass hands out shared connections.
    protected virtual bool DisposeCreatedConnections => true;

    protected ScriptDbInstance(
        string provider,
        string connectionString,
        string[] scriptFiles,
        string dbVersion,
        ScriptSql sql)
    {
        Provider = provider;
        ConnectionString = connectionString;
        InitializationScripts = scriptFiles;
        Sql = sql;
        DbVersion = string.IsNullOrWhiteSpace(dbVersion)
            ? throw new ArgumentException("A database version is required.", nameof(dbVersion))
            : dbVersion;

        lock (InitializationLock)
        {
            var databaseKey = $"{connectionString}\0{dbVersion}";
            if (InitializedDatabases.Contains(databaseKey))
                return;

            WaitForConnection();
            EnsureDatabaseExists();
            InitializedDatabases.Add(databaseKey);
        }
    }

    public abstract IDbConnection CreateDbConnection();

    public virtual bool TestConnection()
    {
        try
        {
            var connection = CreateDbConnection();
            try
            {
                connection.Open();
                return true;
            }
            finally
            {
                if (DisposeCreatedConnections)
                    connection.Dispose();
            }
        }
        catch
        {
            return false;
        }
    }

    protected virtual bool IsAlreadyExistsException(Exception exception) => false;

    protected virtual string PrepareInitializationScript(string script) => script;

    protected virtual string ResolveScriptPath(string fileName)
        => Path.IsPathRooted(fileName)
            ? fileName
            : Path.Combine(Environment.CurrentDirectory, fileName);

    protected virtual string BuildDropTableSql(string tableName)
    {
        var parts = tableName.Split('.', StringSplitOptions.TrimEntries);
        var qualifiedName = string.Join(".", parts.Select(UnquoteIdentifier).Select(QuoteIdentifier));
        return $"DROP TABLE IF EXISTS {qualifiedName};";
    }

    protected string QuoteIdentifier(string identifier)
        => $"{Sql.IdentifierQuotePrefix}{identifier.Replace(Sql.IdentifierQuoteSuffix, Sql.IdentifierQuoteSuffix + Sql.IdentifierQuoteSuffix, StringComparison.Ordinal)}{Sql.IdentifierQuoteSuffix}";

    protected static T ExecuteRawSql<T>(
        IDbConnection connection,
        string sql,
        Func<IDbCommand, T> execute)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        if (connection.State != ConnectionState.Open)
            connection.Open();
        return execute(command);
    }

    protected static void ExecuteRawSql(
        IDbConnection connection,
        string sql,
        Action<IDbCommand> execute)
        => ExecuteRawSql<object?>(connection, sql, command =>
        {
            execute(command);
            return null;
        });

    private void WaitForConnection()
    {
        for (var attempt = 1; attempt <= ConnectionAttempts; attempt++)
        {
            if (TestConnection())
                return;

            if (attempt < ConnectionAttempts)
                Thread.Sleep(ConnectionRetryDelayMilliseconds);
        }
    }

    protected virtual void EnsureDatabaseExists()
    {
        var cn = CreateDbConnection();
        try
        {
            ExecuteBootstrapStatement(() => ExecuteNonQuery(cn, Sql.SqlCreateVersionsTable));
            ExecuteBootstrapStatement(() => ExecuteNonQuery(cn, Sql.SqlCreateTrackedTablesTable));
            if (VersionExists(cn))
                return;
            if (InitializationScripts.Length == 0)
                return;

            DropTrackedTables(cn);
            ExecuteNonQuery(cn, Sql.SqlTruncateTrackedTables);
            foreach (var fileName in InitializationScripts)
            {
                var scripts = File.ReadAllText(ResolveScriptPath(fileName));
                ExecuteNonQuery(cn, PrepareInitializationScript(scripts));
                InsertTrackedTables(cn, scripts);
            }

            InsertVersion(cn);
        }
        finally
        {
            if (DisposeCreatedConnections)
                cn.Dispose();
        }
    }

    private void ExecuteBootstrapStatement(Action statement)
    {
        try
        {
            statement();
        }
        catch (Exception exception) when (IsAlreadyExistsException(exception))
        {
        }
    }

    private bool VersionExists(IDbConnection cn)
        => ExecuteRawSql(cn, Sql.SqlVersionExists, command =>
        {
            AddVersionParameter(command);
            return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture) == 1;
        });

    private void InsertVersion(IDbConnection cn)
        => ExecuteRawSql(cn, Sql.SqlInsertVersion, command =>
        {
            AddVersionParameter(command);
            command.ExecuteNonQuery();
        });

    private void AddVersionParameter(IDbCommand command)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = Sql.SqlVersionParameterName;
        parameter.DbType = DbType.String;
        parameter.Value = DbVersion;
        command.Parameters.Add(parameter);
    }

    private void DropTrackedTables(IDbConnection cn)
    {
        var tableNames = ExecuteRawSql(cn, Sql.SqlReadTrackedTables, command =>
        {
            using var reader = command.ExecuteReader();
            var names = new List<string>();
            while (reader.Read())
                names.Add(reader.GetString(0));
            return names;
        });

        foreach (var tableName in tableNames.Distinct(StringComparer.OrdinalIgnoreCase).Reverse())
            ExecuteNonQuery(cn, BuildDropTableSql(tableName));
    }

    private void InsertTrackedTables(IDbConnection cn, string script)
    {
        var tableNames = Regex.Matches(
                script,
                @"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<name>(?:(?:""[^""]+""|\[[^\]]+\]|`[^`]+`|[A-Za-z_][\w$]*)\s*\.\s*)?(?:""[^""]+""|\[[^\]]+\]|`[^`]+`|[A-Za-z_][\w$]*))",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)
            .Select(match => match.Groups["name"].Value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var tableName in tableNames)
            ExecuteNonQuery(cn, Sql.SqlInsertTrackedTable, Sql.SqlTableNameParameterName, tableName);
    }

    private static string UnquoteIdentifier(string identifier)
    {
        if (identifier.Length >= 2
            && ((identifier[0] == '"' && identifier[^1] == '"')
                || (identifier[0] == '[' && identifier[^1] == ']')
                || (identifier[0] == '`' && identifier[^1] == '`')))
            return identifier[1..^1];
        return identifier;
    }

    private static void ExecuteNonQuery(IDbConnection cn, string sql)
        => ExecuteRawSql(cn, sql, command => command.ExecuteNonQuery());

    private static void ExecuteNonQuery(
        IDbConnection cn,
        string sql,
        string parameterName,
        string parameterValue)
        => ExecuteRawSql(cn, sql, command =>
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = parameterName;
            parameter.DbType = DbType.String;
            parameter.Value = parameterValue;
            command.Parameters.Add(parameter);
            command.ExecuteNonQuery();
        });
}
