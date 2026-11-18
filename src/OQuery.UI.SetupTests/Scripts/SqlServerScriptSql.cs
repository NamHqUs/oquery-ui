namespace OQuery.Database.Scripts;

public sealed class SqlServerScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => "IF SCHEMA_ID(N'scripts') IS NULL EXEC(N'CREATE SCHEMA [scripts]'); IF OBJECT_ID(N'[scripts].[Versions]', N'U') IS NULL CREATE TABLE [scripts].[Versions] ([Version] nvarchar(255) NOT NULL PRIMARY KEY, [CreateOn] datetime2 NOT NULL DEFAULT SYSUTCDATETIME());";

    public override string SqlVersionExists
        => "SELECT CASE WHEN EXISTS (SELECT 1 FROM [scripts].[Versions] WHERE [Version] = @DbVersion) THEN 1 ELSE 0 END;";

    public override string SqlInsertVersion
        => "INSERT INTO [scripts].[Versions] ([Version]) VALUES (@DbVersion);";

    public override string SqlCreateTrackedTablesTable
        => "IF OBJECT_ID(N'[scripts].[TrackedTables]', N'U') IS NULL CREATE TABLE [scripts].[TrackedTables] ([TableName] nvarchar(1024) NOT NULL);";

    public override string SqlReadTrackedTables
        => "SELECT [TableName] FROM [scripts].[TrackedTables];";

    public override string SqlTruncateTrackedTables
        => "TRUNCATE TABLE [scripts].[TrackedTables];";

    public override string SqlInsertTrackedTable
        => "INSERT INTO [scripts].[TrackedTables] ([TableName]) VALUES (@TableName);";

    public override string IdentifierQuotePrefix => "[";
    public override string IdentifierQuoteSuffix => "]";
}
