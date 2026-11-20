using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace OQuery.UI.Application.Analytics;

/// <summary>Writes collected request counts to storage every OQuery:Analytics:FlushIntervalSeconds (default 60). Failed writes are merged back for the next attempt. Does nothing when analytics is disabled.</summary>
public sealed class AnalyticsUsageFlushService(
    RequestUsageCollector collector,
    IServiceProvider services,
    IOptions<OQueryOptions> options,
    ILogger<AnalyticsUsageFlushService> logger) : BackgroundService
{
    private IAnalyticsRepository? _repository;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var analytics = options.Value.Analytics;
        if (!analytics.IsEnabled)
            return;

        var intervalSeconds = analytics.FlushIntervalSeconds;
        if (intervalSeconds < 1)
            throw new InvalidOperationException("OQuery:Analytics:FlushIntervalSeconds must be at least 1.");

        _repository = services.GetRequiredService<IAnalyticsRepository>();
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
        if (_repository is null)
            return;

        var rows = collector.Drain();
        if (rows.Count == 0)
            return;

        try
        {
            await _repository.AddUsageAsync(rows, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Analytics flush failed; {Rows} rows will be retried.", rows.Count);
            foreach (var row in rows)
                collector.Add(row.Day, row.SectionId, row.Url, row.Page, row.Count);
        }
    }
}
