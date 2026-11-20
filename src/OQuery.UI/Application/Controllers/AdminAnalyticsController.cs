using OQuery.UI.Abstracts.Repositories;
using Microsoft.Extensions.Options;
using OQuery.UI.Application.Analytics;
using OQuery.UI.Hosting;
using System.Diagnostics.CodeAnalysis;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("analytics/admin")]
[AdminToken]
public sealed class AdminAnalyticsController(IServiceProvider services, IOptions<OQueryOptions> options) : ControllerBase
{
    private const int DefaultRangeDays = 30;
    private const int MaxRangeDays = 366;
    private const int DefaultLimit = 50;
    private const int MaxLimit = 500;

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        return Ok(await repository.GetSummaryAsync(start, end, cancellationToken));
    }

    [HttpGet("urls")]
    public async Task<IActionResult> Urls([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int limit = DefaultLimit, CancellationToken cancellationToken = default)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        var rows = await repository.GetUrlStatsAsync(start, end, Math.Clamp(limit, 1, MaxLimit), cancellationToken);
        return Ok(rows.ToArray());
    }

    [HttpGet("pages")]
    public async Task<IActionResult> Pages([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int limit = DefaultLimit, CancellationToken cancellationToken = default)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        var rows = await repository.GetPageStatsAsync(start, end, Math.Clamp(limit, 1, MaxLimit), cancellationToken);
        return Ok(rows.ToArray());
    }

    private static bool TryResolveRange(DateOnly? from, DateOnly? to, out DateOnly start, out DateOnly end, out IActionResult? error)
    {
        end = to ?? DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        start = from ?? end.AddDays(-DefaultRangeDays);

        string? message = null;
        if (start >= end)
            message = "'from' must be before 'to'.";
        else if (end.DayNumber - start.DayNumber > MaxRangeDays)
            message = $"The range may not exceed {MaxRangeDays} days.";

        error = message is null ? null : new BadRequestObjectResult(message);
        return message is null;
    }

    private bool TryGetRepository([NotNullWhen(true)] out IAnalyticsRepository? repository)
    {
        repository = options.Value.Analytics.IsEnabled ? services.GetService<IAnalyticsRepository>() : null;
        return repository is not null;
    }

    private IActionResult StorageNotConfigured()
        => StatusCode(StatusCodes.Status503ServiceUnavailable, "Analytics storage is not configured.");
}
