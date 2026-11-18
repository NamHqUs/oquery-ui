namespace OQuery.Database.Scripts;

public sealed class MySqlScriptSql : ScriptSql
{
    public override string SqlCreateVersionsTable
        => "CREATE DATABASE IF NOT EXISTS `scripts`; CREATE TABLE IF NOT EXISTS `scripts`.`Versions` (`Version` varchar(255) NOT NULL PRIMARY KEY, `CreateOn` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP);";

    public override string SqlVersionExists
        => "SELECT CASE WHEN EXISTS (SELECT 1 FROM `scripts`.`Versions` WHERE `Version` = @DbVersion) THEN 1 ELSE 0 END;";

    public override string SqlInsertVersion
        => "INSERT INTO `scripts`.`Versions` (`Version`) VALUES (@DbVersion);";

    public override string SqlCreateTrackedTablesTable
        => "CREATE TABLE IF NOT EXISTS `scripts`.`TrackedTables` (`TableName` varchar(1024) NOT NULL);";

    public override string SqlReadTrackedTables
        => "SELECT `TableName` FROM `scripts`.`TrackedTables`;";

    public override string SqlTruncateTrackedTables
        => "TRUNCATE TABLE `scripts`.`TrackedTables`;";

    public override string SqlInsertTrackedTable
        => "INSERT INTO `scripts`.`TrackedTables` (`TableName`) VALUES (@TableName);";

    public override string IdentifierQuotePrefix => "`";
    public override string IdentifierQuoteSuffix => "`";
}
