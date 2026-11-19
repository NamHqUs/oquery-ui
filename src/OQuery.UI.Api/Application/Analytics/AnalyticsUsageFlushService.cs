using OQuery.UI.Abstracts.Repositories;

namespace OQuery.UI.Application.Analytics;

/// <summary>Writes collected request counts to storage every OQuery:Analytics:FlushIntervalSeconds (default 5). Failed writes are merged back for the next attempt.</summary>
public sealed class AnalyticsUsageFlushService(
    RequestUsageCollector collector,
    IAnalyticsRepository repository,
    IConfiguration configuration,
    ILogger<AnalyticsUsageFlushService> logger) : BackgroundService
{
    private const int DefaultFlushIntervalSeconds = 60;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalSeconds = configuration.GetValue("OQuery:Analytics:FlushIntervalSeconds", DefaultFlushIntervalSeconds);
        if (intervalSeconds < 1)
            throw new InvalidOperationException("OQuery:Analytics:FlushIntervalSeconds must be at least 1.");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(intervalSeconds));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await FlushAsync(stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await FlushAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }

    private async Task FlushAsync(CancellationToken cancellationToken)
    {
        var rows = collector.Drain();
        if (rows.Count == 0)
            return;

        try
        {
            await repository.AddUsageAsync(rows, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Analytics flush failed; {Rows} rows will be retried.", rows.Count);
            foreach (var row in rows)
                collector.Add(row.Day, row.SectionId, row.Url, row.Page, row.Count);
        }
    }
}
