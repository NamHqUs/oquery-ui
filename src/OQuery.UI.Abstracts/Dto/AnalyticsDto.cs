namespace OQuery.UI.Abstracts.Dto;

/// <summary>One aggregated row: how many API requests a section sent to a route from a frontend page on a UTC day. Page is empty when the client sent none.</summary>
public sealed record AnalyticsUsageRowDto(DateOnly Day, Guid SectionId, string Url, string Page, long Count);

/// <summary>Per UTC day: users whose first visit was that day, users seen before, and total visits (routed requests).</summary>
public sealed record AnalyticsDailyStatDto(DateOnly Day, long NewUsers, long ReturningUsers, long TotalVisits);

public sealed record AnalyticsSummaryDto(IReadOnlyList<AnalyticsDailyStatDto> Days);

/// <summary>Total requests for a route template from a frontend page. Page is empty when the client sent none. Not tied to any user.</summary>
public sealed record AnalyticsUrlStatDto(string Url, long Requests);

public sealed record AnalyticsPageStatDto(string Page, long Requests);
