using Demo.Contracts.Dto;

namespace Demo.Contracts.Services;

public interface IDatabaseService
{
    DatabaseSchemaDto GetDatabaseSchema();
    DatabaseTableDataDto GetTableData(string tableName, string? schema = null, int? limit = null);
}
