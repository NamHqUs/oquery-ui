namespace OQuery.Database.Scripts;

public sealed class FirebirdScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => """
EXECUTE BLOCK AS
BEGIN
    IF (NOT EXISTS (SELECT 1 FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME) = 'Versions')) THEN
        EXECUTE STATEMENT 'CREATE TABLE "Versions" ("Version" VARCHAR(255) NOT NULL PRIMARY KEY, "CreateOn" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)';
END
""";

    public override string SqlVersionExists
        => """SELECT CASE WHEN EXISTS (SELECT 1 FROM "Versions" WHERE "Version" = @DbVersion) THEN 1 ELSE 0 END FROM RDB$DATABASE""";

    public override string SqlInsertVersion
        => """INSERT INTO "Versions" ("Version") VALUES (@DbVersion)""";

    public override string SqlCreateTrackedTablesTable
        => """
EXECUTE BLOCK AS
BEGIN
    IF (NOT EXISTS (SELECT 1 FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME) = 'TrackedTables')) THEN
        EXECUTE STATEMENT 'CREATE TABLE "TrackedTables" ("TableName" VARCHAR(1024) NOT NULL)';
END
""";

    public override string SqlReadTrackedTables
        => """SELECT "TableName" FROM "TrackedTables" """;

    public override string SqlTruncateTrackedTables
        => """DELETE FROM "TrackedTables" """;

    public override string SqlInsertTrackedTable
        => """INSERT INTO "TrackedTables" ("TableName") VALUES (@TableName)""";
}
