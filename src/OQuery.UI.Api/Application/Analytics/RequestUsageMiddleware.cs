using Microsoft.AspNetCore.Routing;
using OQuery.UI.Abstracts.Application;

namespace OQuery.UI.Application.Analytics;

/// <summary>
/// Counts routed API requests for the current section (from the <c>oquery_uid</c> cookie). Uses the route template
/// (not the raw path) so parameter values do not create separate URLs. Analytics' own endpoints are not counted.
/// </summary>
public sealed class RequestUsageMiddleware(RequestUsageCollector collector, IUserSectionManager userSectionManager) : IMiddleware
{
    private const string ClientPageHeader = "X-Client-Page";
    private const string AnalyticsConsentHeader = "X-Analytics-Consent";
    private const int MaxPageLength = 200;

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        if (context.Request.Headers[AnalyticsConsentHeader] == "granted"
            && context.GetEndpoint() is RouteEndpoint { RoutePattern.RawText: { Length: > 0 } template }
            && !template.StartsWith("analytics/", StringComparison.OrdinalIgnoreCase))
        {
            var sectionId = Guid.Parse(userSectionManager.GetSectionId());
            collector.Add(DateOnly.FromDateTime(DateTime.UtcNow), sectionId, "/" + template.TrimStart('/'), ReadClientPage(context));
        }

        await next(context);
    }

    /// <summary>Accepts only a short absolute path from the client header; query and fragment are dropped so arbitrary text cannot fill the stored column.</summary>
    private static string ReadClientPage(HttpContext context)
    {
        var page = context.Request.Headers[ClientPageHeader].ToString();
        var end = page.IndexOfAny(['?', '#']);
        if (end >= 0)
            page = page[..end];
        if (page.Length == 0 || page.Length > MaxPageLength || page[0] != '/')
            return "";
        return page;
    }
}
