using OQuery.UI.Abstracts.Dto;
using OQuery.Database;

namespace OQuery.UI.Abstracts.Services;

public interface IDatabaseService
{
    DatabaseSchemaDto GetDatabaseSchema();
    DatabaseTableDataDto GetTableData(string tableName, string? schema = null, int? limit = null);
}
