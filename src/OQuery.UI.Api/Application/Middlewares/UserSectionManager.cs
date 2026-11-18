using Microsoft.AspNetCore.Http;
using OQuery.UI.Abstracts.Application;

namespace OQuery.UI.Application.Middlewares;

/// <summary>
/// Resolves the section ID for the current request from the first-party <c>oquery_uid</c> cookie. When the cookie is
/// missing or not a GUID, a new ID is created and set as a long-lived cookie. An existing valid ID is never replaced.
/// </summary>
public sealed class UserSectionManager(IHttpContextAccessor httpContextAccessor) : IUserSectionManager
{
    public const string CookieName = "oquery_uid";
    private static readonly TimeSpan CookieLifetime = TimeSpan.FromDays(400);
    private const string ItemKey = "oquery.userSectionId";

    public string GetSectionId()
    {
        var context = httpContextAccessor.HttpContext
            ?? throw new InvalidOperationException("The user section can only be resolved inside an HTTP request.");

        if (context.Items[ItemKey] is string cached)
            return cached;

        var sent = context.Request.Cookies[CookieName];
        var id = Guid.TryParse(sent, out var parsed) && parsed != Guid.Empty
            ? parsed
            : Guid.CreateVersion7();

        var value = id.ToString("D");
        if (value != sent)
        {
            context.Response.Cookies.Append(CookieName, value, new CookieOptions
            {
                MaxAge = CookieLifetime,
                Expires = DateTimeOffset.UtcNow.Add(CookieLifetime),
                HttpOnly = true,
                IsEssential = true,
                SameSite = SameSiteMode.Lax,
                Secure = context.Request.IsHttps,
                Path = "/",
            });
        }

        context.Items[ItemKey] = value;
        return value;
    }
}
