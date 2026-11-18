using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IDatabaseService
{
    DatabaseSchemaDto GetDatabaseSchema();
    DatabaseTableDataDto GetTableData(string tableName, string? schema = null, int? limit = null);
}
