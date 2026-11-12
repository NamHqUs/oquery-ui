using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using OQuery;
using System.Data.Common;
using System.Text.Json;

namespace OQuery.UI.Application.Middlewares;

public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, title) = exception switch
        {
            DbException =>
                (StatusCodes.Status503ServiceUnavailable, "Database operation failed"),
            MetadataNotFoundException =>
                (StatusCodes.Status400BadRequest, "Invalid query metadata"),
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Not Found"),
            ArgumentException or FormatException or JsonException =>
                (StatusCodes.Status400BadRequest, "Bad Request"),
            NotSupportedException => (StatusCodes.Status400BadRequest, "Bad Request"),
            InvalidOperationException => (StatusCodes.Status409Conflict, "Conflict"),
            _ => (0, string.Empty)
        };
        if (statusCode == 0)
            return false;

        logger.LogWarning(exception, "Handled API exception: {Title}", title);
        httpContext.Response.StatusCode = statusCode;
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = exception is DbException
                ? "The database operation failed."
                : exception.Message,
            Instance = httpContext.Request.Path
        };
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}
