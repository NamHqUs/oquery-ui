using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

/// <summary>Persists anonymous visitor analytics and answers the admin aggregate queries.</summary>
public interface IAnalyticsRepository
{
    /// <summary>Upserts the section and appends its page views. Page views must already be normalized.</summary>
    Task RecordBatchAsync(AnalyticsBatchDto batch, DateTimeOffset receivedAt, CancellationToken cancellationToken = default);

    /// <summary>Counts sections that started in [from, to).</summary>
    Task<AnalyticsSummaryDto> GetSummaryAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AnalyticsPageStatDto>> GetPageStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AnalyticsVisitorStatDto>> GetVisitorStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AnalyticsSourceStatDto>> GetSourceStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default);
}
