namespace OQuery.UI.Abstracts.Dto;

/// <summary>One tracker flush from the browser. Durations are measured in the browser; all timestamps are set by the server.</summary>
public sealed record AnalyticsBatchDto(
    Guid VisitorId,
    Guid SectionId,
    string? Referrer,
    string? UtmSource,
    string? UtmMedium,
    string? UtmCampaign,
    string? LandingPage,
    IReadOnlyList<AnalyticsPageViewDto>? PageViews);

public sealed record AnalyticsPageViewDto(string Page, int DurationMs);

public sealed record AnalyticsSummaryDto(
    long Visitors,
    long Sections,
    long PageViews,
    double AverageSectionSeconds,
    double SectionsPerVisitor);

public sealed record AnalyticsPageStatDto(
    string Page,
    long Views,
    long UniqueSections,
    double AverageSeconds,
    double TotalSeconds);

public sealed record AnalyticsVisitorStatDto(
    Guid VisitorId,
    long Sections,
    double TotalSeconds,
    DateTimeOffset LastSeenAt);

public sealed record AnalyticsSourceStatDto(
    string? ReferrerHost,
    string? UtmSource,
    string? UtmCampaign,
    long Sections);
