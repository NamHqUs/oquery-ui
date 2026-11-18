using OQuery.UI.Abstracts.Repositories;

namespace OQuery.UI.Application.Analytics;

/// <summary>Writes collected request counts to storage every minute. Failed writes are merged back for the next attempt.</summary>
public sealed class AnalyticsUsageFlushService(
    RequestUsageCollector collector,
    IAnalyticsRepository repository,
    ILogger<AnalyticsUsageFlushService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
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
