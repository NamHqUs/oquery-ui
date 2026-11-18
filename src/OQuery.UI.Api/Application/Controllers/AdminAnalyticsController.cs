using Microsoft.AspNetCore.Mvc;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Application.Analytics;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("analytics/admin")]
[AdminToken]
public sealed class AdminAnalyticsController(IServiceProvider services) : ControllerBase
{
    private const int DefaultRangeDays = 30;
    private const int MaxRangeDays = 366;
    private const int DefaultLimit = 50;
    private const int MaxLimit = 500;

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken cancellationToken)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        return Ok(await repository.GetSummaryAsync(start, end, cancellationToken));
    }

    [HttpGet("pages")]
    public async Task<IActionResult> Pages([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int limit = DefaultLimit, CancellationToken cancellationToken = default)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        return Ok(await repository.GetPageStatsAsync(start, end, ClampLimit(limit), cancellationToken));
    }

    [HttpGet("visitors")]
    public async Task<IActionResult> Visitors([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int limit = DefaultLimit, CancellationToken cancellationToken = default)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        return Ok(await repository.GetVisitorStatsAsync(start, end, ClampLimit(limit), cancellationToken));
    }

    [HttpGet("sources")]
    public async Task<IActionResult> Sources([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] int limit = DefaultLimit, CancellationToken cancellationToken = default)
    {
        if (!TryResolveRange(from, to, out var start, out var end, out var error))
            return error!;
        if (!TryGetRepository(out var repository))
            return StorageNotConfigured();

        return Ok(await repository.GetSourceStatsAsync(start, end, ClampLimit(limit), cancellationToken));
    }

    private static bool TryResolveRange(DateTimeOffset? from, DateTimeOffset? to, out DateTimeOffset start, out DateTimeOffset end, out IActionResult? error)
    {
        end = to ?? DateTimeOffset.UtcNow;
        start = from ?? end.AddDays(-DefaultRangeDays);

        string? message = null;
        if (start >= end)
            message = "'from' must be before 'to'.";
        else if (end - start > TimeSpan.FromDays(MaxRangeDays))
            message = $"The range may not exceed {MaxRangeDays} days.";

        error = message is null ? null : new BadRequestObjectResult(message);
        return message is null;
    }

    private bool TryGetRepository(out IAnalyticsRepository repository)
    {
        repository = services.GetService<IAnalyticsRepository>()!;
        return repository is not null;
    }

    private static int ClampLimit(int limit) => Math.Clamp(limit, 1, MaxLimit);

    private IActionResult StorageNotConfigured()
        => StatusCode(StatusCodes.Status503ServiceUnavailable, "Analytics storage is not configured.");
}
