using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IDatabaseService
{
    void Connect(string provider, string connectionString);
    DatabaseSchema GetDatabaseSchema();
    DatabaseTableData GetTableData(string tableName, string? schema = null, int? limit = null);
}
