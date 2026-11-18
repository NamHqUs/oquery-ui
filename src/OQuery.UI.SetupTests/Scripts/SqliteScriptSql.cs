namespace OQuery.Database.Scripts;

public sealed class SqliteScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => """CREATE TABLE IF NOT EXISTS "scripts"."Versions" ("Version" TEXT PRIMARY KEY NOT NULL, "CreateOn" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);""";

    public override string SqlVersionExists
        => """SELECT EXISTS (SELECT 1 FROM "scripts"."Versions" WHERE "Version" = @DbVersion);""";

    public override string SqlInsertVersion
        => """INSERT INTO "scripts"."Versions" ("Version") VALUES (@DbVersion);""";

    public override string SqlCreateTrackedTablesTable
        => """CREATE TABLE IF NOT EXISTS "scripts"."TrackedTables" ("TableName" TEXT NOT NULL);""";

    public override string SqlReadTrackedTables
        => """SELECT "TableName" FROM "scripts"."TrackedTables";""";

    public override string SqlTruncateTrackedTables
        => """DELETE FROM "scripts"."TrackedTables";""";

    public override string SqlInsertTrackedTable
        => """INSERT INTO "scripts"."TrackedTables" ("TableName") VALUES (@TableName);""";
}
