namespace OQuery.Database.Scripts;

public sealed class Db2ScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => "CREATE SCHEMA scripts; CREATE TABLE scripts.Versions (Version varchar(255) NOT NULL PRIMARY KEY, CreateOn timestamp NOT NULL DEFAULT CURRENT TIMESTAMP);";

    public override string SqlVersionExists
        => "SELECT CASE WHEN EXISTS (SELECT 1 FROM scripts.Versions WHERE Version = @DbVersion) THEN 1 ELSE 0 END FROM SYSIBM.SYSDUMMY1";

    public override string SqlInsertVersion
        => "INSERT INTO scripts.Versions (Version) VALUES (@DbVersion)";

    public override string SqlCreateTrackedTablesTable
        => "CREATE TABLE scripts.TrackedTables (TableName varchar(1024) NOT NULL)";

    public override string SqlReadTrackedTables
        => "SELECT TableName FROM scripts.TrackedTables";

    public override string SqlTruncateTrackedTables
        => "TRUNCATE TABLE scripts.TrackedTables IMMEDIATE";

    public override string SqlInsertTrackedTable
        => "INSERT INTO scripts.TrackedTables (TableName) VALUES (@TableName)";
}
