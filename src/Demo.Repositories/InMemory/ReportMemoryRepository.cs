using Demo.Contracts.Repositories;
using Demo.Contracts.Dto;

namespace Demo.Repositories.InMemory;

public sealed class ReportMemoryRepository : IReportRepository
{
    private readonly Dictionary<string, Dictionary<string, ReportDto>> _reports =
        new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyCollection<ReportDto> GetUserDefined(string userSectionId)
        => _reports.TryGetValue(userSectionId, out var reports)
            ? reports.Values.OrderByDescending(report => report.FileName).ToArray()
            : [];

    public IReadOnlyCollection<ReportDto> GetBuiltin() => [];

    public ReportDto? Get(string userSectionId, string id)
        => _reports.TryGetValue(userSectionId, out var reports)
            ? reports.GetValueOrDefault(id)
            : null;

    public void Save(string userSectionId, ReportDto report)
        => GetOrCreateSection(userSectionId)[report.FileName] = report;

    public bool Delete(string userSectionId, string id)
        => _reports.TryGetValue(userSectionId, out var reports) && reports.Remove(id);

    public string CreateId(string userSectionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userSectionId);
        string id;
        do
        {
            id = Guid.NewGuid().ToString("N")[..10];
        }
        while (_reports.TryGetValue(userSectionId, out var reports) && reports.ContainsKey(id));

        return id;
    }

    private Dictionary<string, ReportDto> GetOrCreateSection(string userSectionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userSectionId);
        if (!_reports.TryGetValue(userSectionId, out var reports))
        {
            reports = new Dictionary<string, ReportDto>(StringComparer.OrdinalIgnoreCase);
            _reports.Add(userSectionId, reports);
        }
        return reports;
    }
}
