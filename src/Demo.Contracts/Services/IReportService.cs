using Demo.Contracts.Dto;
using OQuery;

namespace Demo.Contracts.Services;

public interface IReportService
{
    IReadOnlyList<ReportDto> ListReports();
    ReportDto SaveReport(
        QueryDefinition query,
        string? fileName = null,
        string? requestText = null,
        string? description = null,
        string? chartType = null);
    ReportDto? GetReport(string fileName);
    string GetQueryRequestString(QueryDefinition query);
    QueryDefinition ParseQueryRequestString(string text, string entity);
    QueryDefinition ParseQueryRequestString(string text);
    ReportDto? UpdateReport(
        string fileName,
        QueryDefinition query,
        string? requestText = null,
        string? description = null,
        string? chartType = null);
    bool DeleteReport(string fileName);
}
