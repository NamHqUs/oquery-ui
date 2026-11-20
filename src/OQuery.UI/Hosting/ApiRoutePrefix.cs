using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.Mvc.Routing;

namespace OQuery.UI.Hosting;

/// <summary>
/// Applies <c>OQuery:Api:BasePath</c> to the controller route templates, so Swagger and the frontend see the same URLs.
/// </summary>
internal static class ApiRoutePrefix
{
    public static string Normalize(string? basePath)
    {
        var trimmed = (basePath ?? string.Empty).Trim().TrimEnd('/');
        if (trimmed.Length == 0)
            return string.Empty;
        if (!trimmed.StartsWith('/'))
            throw new ArgumentException("OQuery:Api:BasePath must start with '/', such as '/oquery-api'.", nameof(basePath));
        return trimmed;
    }

    public static void Apply(MvcOptions mvc, string prefix)
    {
        if (prefix.Length > 0)
            mvc.Conventions.Insert(0, new RoutePrefixConvention(new RouteAttribute(prefix)));
    }

    private sealed class RoutePrefixConvention(IRouteTemplateProvider route) : IApplicationModelConvention
    {
        private readonly AttributeRouteModel _prefix = new(route);

        public void Apply(ApplicationModel application)
        {
            foreach (var controller in application.Controllers)
            {
                foreach (var selector in controller.Selectors)
                {
                    selector.AttributeRouteModel = selector.AttributeRouteModel is null
                        ? _prefix
                        : AttributeRouteModel.CombineAttributeRouteModel(_prefix, selector.AttributeRouteModel);
                }
            }
        }
    }
}
