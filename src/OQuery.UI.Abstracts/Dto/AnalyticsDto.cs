namespace OQuery.UI.Abstracts.Dto;

/// <summary>One aggregated row: how many API requests a section sent to a route from a frontend page on a UTC day. Page is empty when the client sent none.</summary>
public sealed record AnalyticsUsageRowDto(DateOnly Day, string SectionId, string Url, string Page, long Count);

/// <summary>Per UTC day: visitors whose first visit was that day, visitors seen before, and routed request totals.</summary>
public sealed record AnalyticsDailyStatDto(DateOnly Day, long NewUsers, long ReturningUsers, long TotalVisits);

public sealed record AnalyticsSummaryDto(IReadOnlyList<AnalyticsDailyStatDto> Days, long TotalVisitors);

/// <summary>Total requests for a route template from a frontend page. Page is empty when the client sent none. Not tied to any user.</summary>
public sealed record AnalyticsUrlStatDto(string Url, long Requests);

public sealed record AnalyticsPageStatDto(string Page, long Requests);
