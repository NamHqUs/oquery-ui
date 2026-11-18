using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Application.Analytics;

/// <summary>Validates and normalizes untrusted tracker input. Returns null when the envelope itself is invalid.</summary>
public static class AnalyticsBatchNormalizer
{
    public const int MaxPageViews = 50;
    public const int MaxPathLength = 300;
    public const int MaxFieldLength = 100;
    public const int MaxDurationMs = 4 * 60 * 60 * 1000;

    public static AnalyticsBatchDto? Normalize(AnalyticsBatchDto batch)
    {
        if (batch.VisitorId == Guid.Empty || batch.SectionId == Guid.Empty)
            return null;

        var rawViews = batch.PageViews ?? [];
        if (rawViews.Count > MaxPageViews)
            return null;

        var pageViews = new List<AnalyticsPageViewDto>(rawViews.Count);
        foreach (var view in rawViews)
        {
            var page = NormalizePath(view?.Page);
            if (page is null || IsAdminPath(page))
                continue;

            pageViews.Add(new AnalyticsPageViewDto(page, Math.Clamp(view!.DurationMs, 0, MaxDurationMs)));
        }

        return new AnalyticsBatchDto(
            VisitorId: batch.VisitorId,
            SectionId: batch.SectionId,
            Referrer: NormalizeReferrerHost(batch.Referrer),
            UtmSource: Limit(batch.UtmSource),
            UtmMedium: Limit(batch.UtmMedium),
            UtmCampaign: Limit(batch.UtmCampaign),
            LandingPage: NormalizePath(batch.LandingPage),
            PageViews: pageViews);
    }

    /// <summary>Keeps only the path: drops query and hash, requires a same-site absolute path.</summary>
    public static string? NormalizePath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var value = raw.Trim();
        var cut = value.IndexOfAny(['?', '#']);
        if (cut >= 0)
            value = value[..cut];

        if (!value.StartsWith('/') || value.StartsWith("//") || value.Length > MaxPathLength)
            return null;

        return value;
    }

    public static bool IsAdminPath(string path)
        => path == "/admin" || path.StartsWith("/admin/", StringComparison.Ordinal);

    /// <summary>Stores only the host of an absolute http(s) referrer. Relative or other schemes are dropped.</summary>
    public static string? NormalizeReferrerHost(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || !Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var uri))
            return null;

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return null;

        return Limit(uri.Host.ToLowerInvariant());
    }

    private static string? Limit(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return null;

        return trimmed.Length > MaxFieldLength ? trimmed[..MaxFieldLength] : trimmed;
    }
}
