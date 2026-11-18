namespace OQuery.Database.Scripts;

public sealed class OracleScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => """
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE "scripts"."Versions" ("Version" VARCHAR2(255) NOT NULL PRIMARY KEY, "CreateOn" TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
""";

    public override string SqlVersionExists
        => """SELECT CASE WHEN EXISTS (SELECT 1 FROM "scripts"."Versions" WHERE "Version" = :DbVersion) THEN 1 ELSE 0 END FROM DUAL""";

    public override string SqlInsertVersion
        => """INSERT INTO "scripts"."Versions" ("Version") VALUES (:DbVersion)""";

    public override string SqlVersionParameterName => ":DbVersion";
    public override string SqlTableNameParameterName => ":TableName";

    public override string SqlCreateTrackedTablesTable
        => """CREATE TABLE "scripts"."TrackedTables" ("TableName" VARCHAR2(1024) NOT NULL)""";

    public override string SqlReadTrackedTables
        => """SELECT "TableName" FROM "scripts"."TrackedTables";""";

    public override string SqlTruncateTrackedTables
        => """TRUNCATE TABLE "scripts"."TrackedTables";""";

    public override string SqlInsertTrackedTable
        => """INSERT INTO "scripts"."TrackedTables" ("TableName") VALUES (:TableName)""";
}
