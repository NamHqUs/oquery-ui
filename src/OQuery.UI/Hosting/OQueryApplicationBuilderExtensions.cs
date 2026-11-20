using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OQuery.UI.Application.Analytics;

namespace OQuery.UI.Hosting;

public static class OQueryApplicationBuilderExtensions
{
    private const string EmbeddedUiRoot = "ui";
    private const string EmbeddedIndexFile = "index.html";
    private const string EmbeddedManifestName = "Microsoft.Extensions.FileProviders.Embedded.Manifest.xml";
    private const string BaseHrefPlaceholder = "<head>";

    /// <summary>Adds the OQuery API pipeline: exception handling and request analytics, then maps the controllers.</summary>
    public static WebApplication UseOQuery(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var oqueryOptions = app.Services.GetRequiredService<IOptions<OQueryOptions>>().Value;

        app.UseExceptionHandler();

        if (oqueryOptions.Analytics.IsEnabled)
            app.UseMiddleware<RequestUsageMiddleware>();

        app.MapControllers();
        return app;
    }

    /// <summary>
    /// Serves the embedded OQuery frontend at <see cref="OQueryUIOptions.BasePath"/> (default <c>/oquery</c>).
    /// The API stays at the root, so the frontend's root-relative requests keep working.
    /// </summary>
    public static IApplicationBuilder UseOQueryUI(this IApplicationBuilder app, Action<OQueryUIOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(app);

        var ui = new OQueryUIOptions();
        configure?.Invoke(ui);
        var basePath = NormalizeBasePath(ui.BasePath);

        var assembly = typeof(OQueryApplicationBuilderExtensions).Assembly;
        var files = assembly.GetManifestResourceNames().Contains(EmbeddedManifestName)
            ? new ManifestEmbeddedFileProvider(assembly, EmbeddedUiRoot)
            : null;
        var indexFile = files?.GetFileInfo(EmbeddedIndexFile);
        if (files is null || indexFile is null || !indexFile.Exists)
        {
            // Development runs the frontend dev server separately, so a build without the embedded UI should still start the API.
            app.ApplicationServices.GetRequiredService<ILoggerFactory>().CreateLogger("OQuery.UI")
                .LogWarning("The OQuery frontend is not embedded, so {BasePath} is not served. Run the frontend dev server, or build with -p:BuildOQueryUI=true to embed it.", basePath);
            return app;
        }

        var indexHtml = ReadIndexWithBaseHref(indexFile, basePath + "/");

        app.Map(basePath, branch =>
        {
            branch.Use(async (context, next) =>
            {
                if (string.IsNullOrEmpty(context.Request.Path.Value))
                {
                    // "/oquery" -> "/oquery/" so relative asset URLs resolve under the base path.
                    context.Response.Redirect(basePath + "/" + context.Request.QueryString);
                    return;
                }

                await next(context);
            });

            branch.UseStaticFiles(new StaticFileOptions { FileProvider = files, ServeUnknownFileTypes = false });

            branch.Run(async context =>
            {
                if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
                {
                    context.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
                    return;
                }

                // Client-side routes fall back to index.html.
                context.Response.ContentType = "text/html; charset=utf-8";
                await context.Response.WriteAsync(indexHtml);
            });
        });

        return app;
    }

    private static string NormalizeBasePath(string? basePath)
    {
        var trimmed = (basePath ?? string.Empty).Trim().TrimEnd('/');
        if (trimmed.Length == 0 || !trimmed.StartsWith('/'))
            throw new ArgumentException("OQueryUIOptions.BasePath must be a non-root path that starts with '/', such as '/oquery'.", nameof(basePath));
        return trimmed;
    }

    private static string ReadIndexWithBaseHref(IFileInfo indexFile, string baseHref)
    {
        using var stream = indexFile.CreateReadStream();
        using var reader = new StreamReader(stream);
        var html = reader.ReadToEnd();

        var headIndex = html.IndexOf(BaseHrefPlaceholder, StringComparison.OrdinalIgnoreCase);
        if (headIndex < 0)
            throw new InvalidOperationException("The embedded index.html has no <head> element.");

        var insertAt = headIndex + BaseHrefPlaceholder.Length;
        return html.Insert(insertAt, $"<base href=\"{baseHref}\" />");
    }
}
