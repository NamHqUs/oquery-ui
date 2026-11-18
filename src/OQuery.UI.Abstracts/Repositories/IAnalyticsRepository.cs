using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

/// <summary>Stores daily user and URL counts and answers the admin aggregate queries.</summary>
public interface IAnalyticsRepository
{
    /// <summary>Adds (day, user, url) counts. Rows may repeat keys; they are summed.</summary>
    Task AddUsageAsync(IReadOnlyList<AnalyticsUsageRowDto> rows, CancellationToken cancellationToken = default);

    /// <summary>Daily new, returning, and total visits for UTC days in [from, to).</summary>
    Task<AnalyticsSummaryDto> GetSummaryAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    /// <summary>Most requested API route templates for UTC days in [from, to).</summary>
    Task<IReadOnlyList<AnalyticsUrlStatDto>> GetUrlStatsAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default);

    /// <summary>Most requested frontend pages for UTC days in [from, to). An empty page means the client sent none.</summary>
    Task<IReadOnlyList<AnalyticsPageStatDto>> GetPageStatsAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default);
}
