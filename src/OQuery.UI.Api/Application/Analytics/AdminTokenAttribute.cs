using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Configuration;

namespace OQuery.UI.Application.Analytics;

/// <summary>Protects admin endpoints with the ADMIN_TOKEN setting. Fails closed: unset token returns 404.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AdminTokenAttribute : Attribute, IAsyncActionFilter
{
    public const string HeaderName = "X-Admin-Token";
    public const string ConfigurationKey = "ADMIN_TOKEN";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var configured = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>()[ConfigurationKey];
        if (string.IsNullOrEmpty(configured))
        {
            context.Result = new NotFoundResult();
            return;
        }

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!Matches(configured, provided))
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        await next();
    }

    public static bool Matches(string expected, string provided)
        => CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(provided));
}
