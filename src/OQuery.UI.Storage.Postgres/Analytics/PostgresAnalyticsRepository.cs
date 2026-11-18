using Npgsql;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;

namespace OQuery.UI.Storage.Postgres.Analytics;

/// <summary>Stores anonymous sections and page views in Postgres. Schema is created and pruned on first use.</summary>
public sealed class PostgresAnalyticsRepository : IAnalyticsRepository
{
    private static readonly TimeSpan PageViewRetention = TimeSpan.FromDays(180);
    private static readonly TimeSpan SectionRetention = TimeSpan.FromDays(365);

    private readonly NpgsqlDataSource _dataSource;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private volatile bool _initialized;

    public PostgresAnalyticsRepository(string connectionString)
    {
        _dataSource = NpgsqlDataSource.Create(connectionString);
    }

    public async Task RecordBatchAsync(AnalyticsBatchDto batch, DateTimeOffset receivedAt, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using (var upsert = new NpgsqlCommand(
            """
            insert into analytics_sections (section_id, visitor_id, started_at, last_seen_at,
                referrer_host, utm_source, utm_medium, utm_campaign, landing_page)
            values (@section, @visitor, @now, @now, @referrer, @utmSource, @utmMedium, @utmCampaign, @landing)
            on conflict (section_id)
            do update set last_seen_at = greatest(analytics_sections.last_seen_at, excluded.last_seen_at)
            """,
            connection,
            transaction))
        {
            upsert.Parameters.AddWithValue("section", batch.SectionId);
            upsert.Parameters.AddWithValue("visitor", batch.VisitorId);
            upsert.Parameters.AddWithValue("now", receivedAt);
            upsert.Parameters.AddWithValue("referrer", (object?)batch.Referrer ?? DBNull.Value);
            upsert.Parameters.AddWithValue("utmSource", (object?)batch.UtmSource ?? DBNull.Value);
            upsert.Parameters.AddWithValue("utmMedium", (object?)batch.UtmMedium ?? DBNull.Value);
            upsert.Parameters.AddWithValue("utmCampaign", (object?)batch.UtmCampaign ?? DBNull.Value);
            upsert.Parameters.AddWithValue("landing", (object?)batch.LandingPage ?? DBNull.Value);
            await upsert.ExecuteNonQueryAsync(cancellationToken);
        }

        var pageViews = batch.PageViews ?? [];
        if (pageViews.Count > 0)
        {
            // One round trip for the whole batch. entered_at is derived from the browser-measured duration.
            await using var insert = new NpgsqlCommand(
                """
                insert into analytics_page_views (section_id, page, entered_at, duration_ms)
                select @section, t.page, @now - (t.duration_ms * interval '1 millisecond'), t.duration_ms
                from unnest(@pages::text[], @durations::int[]) as t(page, duration_ms)
                """,
                connection,
                transaction);
            insert.Parameters.AddWithValue("section", batch.SectionId);
            insert.Parameters.AddWithValue("now", receivedAt);
            insert.Parameters.AddWithValue("pages", pageViews.Select(view => view.Page).ToArray());
            insert.Parameters.AddWithValue("durations", pageViews.Select(view => view.DurationMs).ToArray());
            await insert.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<AnalyticsSummaryDto> GetSummaryAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var command = CreateCommand(
            """
            with s as (
                select section_id, visitor_id, started_at, last_seen_at
                from analytics_sections
                where started_at >= @from and started_at < @to)
            select
                (select count(distinct visitor_id) from s),
                (select count(*) from s),
                (select count(*) from analytics_page_views pv join s on s.section_id = pv.section_id),
                (select coalesce(avg(extract(epoch from (last_seen_at - started_at))), 0)::float8 from s)
            """,
            from,
            to);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        command.Connection = connection;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);

        var visitors = reader.GetInt64(0);
        var sections = reader.GetInt64(1);
        return new AnalyticsSummaryDto(
            Visitors: visitors,
            Sections: sections,
            PageViews: reader.GetInt64(2),
            AverageSectionSeconds: reader.GetDouble(3),
            SectionsPerVisitor: visitors == 0 ? 0 : (double)sections / visitors);
    }

    public async Task<IReadOnlyList<AnalyticsPageStatDto>> GetPageStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var command = CreateCommand(
            """
            select pv.page, count(*), count(distinct pv.section_id),
                coalesce(avg(pv.duration_ms), 0)::float8 / 1000.0,
                (coalesce(sum(pv.duration_ms), 0)::float8 / 1000.0)
            from analytics_page_views pv
            join analytics_sections s on s.section_id = pv.section_id
            where s.started_at >= @from and s.started_at < @to
            group by pv.page
            order by count(*) desc, pv.page
            limit @limit
            """,
            from,
            to,
            limit);
        var rows = new List<AnalyticsPageStatDto>();
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        command.Connection = connection;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new AnalyticsPageStatDto(
                Page: reader.GetString(0),
                Views: reader.GetInt64(1),
                UniqueSections: reader.GetInt64(2),
                AverageSeconds: reader.GetDouble(3),
                TotalSeconds: reader.GetDouble(4)));
        }
        return rows;
    }

    public async Task<IReadOnlyList<AnalyticsVisitorStatDto>> GetVisitorStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var command = CreateCommand(
            """
            select visitor_id, count(*),
                coalesce(sum(extract(epoch from (last_seen_at - started_at))), 0)::float8,
                max(last_seen_at)
            from analytics_sections
            where started_at >= @from and started_at < @to
            group by visitor_id
            order by max(last_seen_at) desc
            limit @limit
            """,
            from,
            to,
            limit);
        var rows = new List<AnalyticsVisitorStatDto>();
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        command.Connection = connection;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new AnalyticsVisitorStatDto(
                VisitorId: reader.GetGuid(0),
                Sections: reader.GetInt64(1),
                TotalSeconds: reader.GetDouble(2),
                LastSeenAt: reader.GetFieldValue<DateTimeOffset>(3)));
        }
        return rows;
    }

    public async Task<IReadOnlyList<AnalyticsSourceStatDto>> GetSourceStatsAsync(DateTimeOffset from, DateTimeOffset to, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var command = CreateCommand(
            """
            select referrer_host, utm_source, utm_campaign, count(*)
            from analytics_sections
            where started_at >= @from and started_at < @to
            group by referrer_host, utm_source, utm_campaign
            order by count(*) desc, referrer_host, utm_source, utm_campaign
            limit @limit
            """,
            from,
            to,
            limit);
        var rows = new List<AnalyticsSourceStatDto>();
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        command.Connection = connection;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new AnalyticsSourceStatDto(
                ReferrerHost: reader.IsDBNull(0) ? null : reader.GetString(0),
                UtmSource: reader.IsDBNull(1) ? null : reader.GetString(1),
                UtmCampaign: reader.IsDBNull(2) ? null : reader.GetString(2),
                Sections: reader.GetInt64(3)));
        }
        return rows;
    }

    private static NpgsqlCommand CreateCommand(string sql, DateTimeOffset from, DateTimeOffset to, int? limit = null)
    {
        var command = new NpgsqlCommand(sql);
        command.Parameters.AddWithValue("from", from);
        command.Parameters.AddWithValue("to", to);
        if (limit is { } value)
            command.Parameters.AddWithValue("limit", value);
        return command;
    }

    private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
            return;

        await _initLock.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
                return;

            await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

            await using (var create = new NpgsqlCommand(
                """
                create table if not exists analytics_sections (
                    section_id     uuid primary key,
                    visitor_id     uuid not null,
                    started_at     timestamptz not null,
                    last_seen_at   timestamptz not null,
                    referrer_host  text,
                    utm_source     text,
                    utm_medium     text,
                    utm_campaign   text,
                    landing_page   text);
                create table if not exists analytics_page_views (
                    id             bigserial primary key,
                    section_id     uuid not null references analytics_sections(section_id),
                    page           text not null,
                    entered_at     timestamptz not null,
                    duration_ms    integer not null);
                create index if not exists ix_analytics_sections_started_at on analytics_sections (started_at);
                create index if not exists ix_analytics_sections_visitor_id on analytics_sections (visitor_id);
                create index if not exists ix_analytics_page_views_section_id on analytics_page_views (section_id);
                create index if not exists ix_analytics_page_views_page_entered_at on analytics_page_views (page, entered_at);
                """,
                connection,
                transaction))
            {
                await create.ExecuteNonQueryAsync(cancellationToken);
            }

            // Page views go first so sections never lose rows referenced by them.
            await using (var prune = new NpgsqlCommand(
                """
                delete from analytics_page_views where entered_at < now() - @pageRetention;
                delete from analytics_sections s where s.last_seen_at < now() - @sectionRetention
                    and not exists (select 1 from analytics_page_views pv where pv.section_id = s.section_id);
                """,
                connection,
                transaction))
            {
                prune.Parameters.AddWithValue("pageRetention", PageViewRetention);
                prune.Parameters.AddWithValue("sectionRetention", SectionRetention);
                await prune.ExecuteNonQueryAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            _initialized = true;
        }
        finally
        {
            _initLock.Release();
        }
    }
}
