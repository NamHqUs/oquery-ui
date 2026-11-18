using Microsoft.AspNetCore.Mvc;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Application.Analytics;

namespace OQuery.UI.Application.Controllers;

/// <summary>Public, anonymous tracker ingest. Always 204 for valid input, even when storage is unavailable.</summary>
[ApiController]
[Route("analytics/events")]
public sealed class AnalyticsEventsController(IServiceProvider services, ILogger<AnalyticsEventsController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Ingest([FromBody] AnalyticsBatchDto batch, CancellationToken cancellationToken)
    {
        var normalized = AnalyticsBatchNormalizer.Normalize(batch);
        if (normalized is null)
            return BadRequest("visitorId and sectionId must be non-empty GUIDs, and pageViews may contain at most 50 items.");

        // Resolved per request: analytics is optional, so the repository is not always registered.
        var repository = services.GetService<IAnalyticsRepository>();
        if (repository is null)
            return NoContent();

        try
        {
            await repository.RecordBatchAsync(normalized, DateTimeOffset.UtcNow, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Analytics batch could not be stored and was dropped.");
        }

        return NoContent();
    }
}
