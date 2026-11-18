namespace OQuery.Database.Scripts;

/// <summary>
/// Provider-specific SQL used to bootstrap a database with versioned initialization scripts.
/// </summary>
public abstract class ScriptSql
{
    public abstract string SqlCreateVersionsTable { get; }
    public abstract string SqlVersionExists { get; }
    public abstract string SqlInsertVersion { get; }
    public abstract string SqlCreateTrackedTablesTable { get; }
    public abstract string SqlReadTrackedTables { get; }
    public abstract string SqlTruncateTrackedTables { get; }
    public abstract string SqlInsertTrackedTable { get; }
    public virtual string SqlVersionParameterName => "@DbVersion";
    public virtual string SqlTableNameParameterName => "@TableName";
    public virtual string IdentifierQuotePrefix => "\"";
    public virtual string IdentifierQuoteSuffix => "\"";
}
