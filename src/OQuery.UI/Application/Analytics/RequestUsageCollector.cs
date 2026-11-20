using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Application.Analytics;

/// <summary>
/// In-memory daily counters keyed by (day, section, url, page). The middleware adds to it per request and
/// <see cref="AnalyticsUsageFlushService"/> drains it to storage. New keys are dropped once the cap is reached.
/// </summary>
public sealed class RequestUsageCollector
{
    public const int MaxEntries = 100_000;

    private readonly object _gate = new();
    private readonly Dictionary<(DateOnly Day, Guid SectionId, string Url, string Page), long> _counts = new();

    public void Add(DateOnly day, Guid sectionId, string url, string page = "", long count = 1)
    {
        lock (_gate)
        {
            var key = (day, sectionId, url, page);
            if (_counts.TryGetValue(key, out var current))
                _counts[key] = current + count;
            else if (_counts.Count < MaxEntries)
                _counts[key] = count;
        }
    }

    /// <summary>Returns and clears all counters.</summary>
    public IReadOnlyList<AnalyticsUsageRowDto> Drain()
    {
        lock (_gate)
        {
            var rows = _counts.Select(pair => new AnalyticsUsageRowDto(pair.Key.Day, pair.Key.SectionId, pair.Key.Url, pair.Key.Page, pair.Value)).ToList();
            _counts.Clear();
            return rows;
        }
    }
}
