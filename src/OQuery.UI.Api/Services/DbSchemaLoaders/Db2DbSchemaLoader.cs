using IBM.Data.Db2;
using System.Data;
using OQuery.Database.Scripts;

using OQuery.Database;

namespace OQuery.UI.Api.Services.DbSchemaLoaders;

public sealed class Db2DbSchemaLoader(string connectionString, string[] scriptFiles, string dbVersion)
    : DbSchemaLoader("Db2", connectionString, scriptFiles, dbVersion, new Db2ScriptSql())
{
    protected override string SqlGetColumns => """
        SELECT
            columns.TABSCHEMA AS SchemaName,
            columns.TABNAME AS TableName,
            columns.COLNAME AS ColumnName,
            columns.TYPENAME AS DataType,
            CASE WHEN columns.NULLS = 'Y' THEN 1 ELSE 0 END AS IsNullable,
            CASE WHEN primaryKeys.COLNAME IS NULL THEN 0 ELSE 1 END AS IsPrimaryKey
        FROM SYSCAT.COLUMNS AS columns
        LEFT JOIN SYSCAT.KEYCOLUSE AS primaryKeys
            ON primaryKeys.TABSCHEMA = columns.TABSCHEMA
            AND primaryKeys.TABNAME = columns.TABNAME
            AND primaryKeys.COLNAME = columns.COLNAME
            AND primaryKeys.CONSTNAME IN (
                SELECT CONSTNAME FROM SYSCAT.TABCONST
                WHERE TABSCHEMA = columns.TABSCHEMA
                    AND TABNAME = columns.TABNAME
                    AND TYPE = 'P')
        WHERE columns.TABSCHEMA NOT LIKE 'SYS%'
        ORDER BY columns.TABSCHEMA, columns.TABNAME, columns.COLNO
        """;

    protected override string SqlGetRelationships => """
        SELECT
            relations.CONSTNAME AS RelationName,
            relations.TABSCHEMA AS SourceSchema,
            relations.TABNAME AS SourceTable,
            relations.COLNAME AS SourceColumn,
            relations.REFTABSCHEMA AS TargetSchema,
            relations.REFTABNAME AS TargetTable,
            relations.REFCOLNAME AS TargetColumn,
            relations.COLSEQ AS Ordinal,
            0 AS IsUnique
        FROM SYSCAT.REFERENCES AS relations
        WHERE relations.TABSCHEMA NOT LIKE 'SYS%'
        ORDER BY relations.CONSTNAME, relations.COLSEQ
        """;

    public override IDbConnection CreateDbConnection()
        => new DB2Connection(ConnectionString);
}
