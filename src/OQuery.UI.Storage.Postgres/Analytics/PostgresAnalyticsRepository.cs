using Npgsql;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;

namespace OQuery.UI.Storage.Postgres.Analytics;

/// <summary>Stores daily user and URL counts in Postgres. Schema is created and pruned on first use.</summary>
public sealed class PostgresAnalyticsRepository : IAnalyticsRepository
{
    private static readonly TimeSpan Retention = TimeSpan.FromDays(365);

    private readonly NpgsqlDataSource _dataSource;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private volatile bool _initialized;

    public PostgresAnalyticsRepository(string connectionString)
    {
        _dataSource = NpgsqlDataSource.Create(connectionString);
    }

    public async Task AddUsageAsync(IReadOnlyList<AnalyticsUsageRowDto> rows, CancellationToken cancellationToken = default)
    {
        if (rows.Count == 0)
            return;

        // One INSERT ... ON CONFLICT cannot touch the same key twice, so sum duplicates here.
        var users = rows.GroupBy(row => row.SectionId)
            .Select(group => (UserId: group.Key, FirstSeen: group.Min(row => row.Day)))
            .ToList();
        var userDays = rows.GroupBy(row => (row.Day, row.SectionId))
            .Select(group => (Day: group.Key.Day, UserId: group.Key.SectionId, Visits: group.Sum(row => row.Count)))
            .ToList();
        var urls = rows.GroupBy(row => (row.Day, row.Url))
            .Select(group => (Day: group.Key.Day, Url: group.Key.Url, Count: group.Sum(row => row.Count)))
            .ToList();
        var pages = rows.GroupBy(row => (row.Day, row.Url, row.Page))
            .Select(group => (Day: group.Key.Day, Url: group.Key.Url, Page: group.Key.Page, Count: group.Sum(row => row.Count)))
            .ToList();

        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await using (var command = new NpgsqlCommand(
            """
            insert into analytic.visitors (user_id, first_seen_day)
            select t.user_id, t.first_seen_day
            from unnest(@userIds::uuid[], @firstSeen::date[]) as t(user_id, first_seen_day)
            on conflict (user_id) do nothing
            """,
            connection,
            transaction))
        {
            command.Parameters.AddWithValue("userIds", users.Select(user => user.UserId).ToArray());
            command.Parameters.AddWithValue("firstSeen", users.Select(user => user.FirstSeen).ToArray());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = new NpgsqlCommand(
            """
            insert into analytic.daily_visitors (day, user_id, visits)
            select t.day, t.user_id, t.visits
            from unnest(@days::date[], @userIds::uuid[], @visits::bigint[]) as t(day, user_id, visits)
            on conflict (day, user_id)
            do update set visits = analytic.daily_visitors.visits + excluded.visits
            """,
            connection,
            transaction))
        {
            command.Parameters.AddWithValue("days", userDays.Select(row => row.Day).ToArray());
            command.Parameters.AddWithValue("userIds", userDays.Select(row => row.UserId).ToArray());
            command.Parameters.AddWithValue("visits", userDays.Select(row => row.Visits).ToArray());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = new NpgsqlCommand(
            """
            insert into analytic.daily_backend (day, url, count)
            select t.day, t.url, t.count
            from unnest(@days::date[], @urls::text[], @counts::bigint[]) as t(day, url, count)
            on conflict (day, url)
            do update set count = analytic.daily_backend.count + excluded.count
            """,
            connection,
            transaction))
        {
            command.Parameters.AddWithValue("days", urls.Select(row => row.Day).ToArray());
            command.Parameters.AddWithValue("urls", urls.Select(row => row.Url).ToArray());
            command.Parameters.AddWithValue("counts", urls.Select(row => row.Count).ToArray());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = new NpgsqlCommand(
            """
            insert into analytic.daily_frontend (day, page, url, count)
            select t.day, t.page, t.url, t.count
            from unnest(@days::date[], @pages::text[], @urls::text[], @counts::bigint[]) as t(day, page, url, count)
            on conflict (day, page, url)
            do update set count = analytic.daily_frontend.count + excluded.count
            """,
            connection,
            transaction))
        {
            command.Parameters.AddWithValue("days", pages.Select(row => row.Day).ToArray());
            command.Parameters.AddWithValue("pages", pages.Select(row => row.Page).ToArray());
            command.Parameters.AddWithValue("urls", pages.Select(row => row.Url).ToArray());
            command.Parameters.AddWithValue("counts", pages.Select(row => row.Count).ToArray());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<AnalyticsSummaryDto> GetSummaryAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = CreateCommand(
            connection,
            """
            select d.day,
                   count(*) filter (where u.first_seen_day = d.day)::bigint,
                   count(*) filter (where u.first_seen_day < d.day)::bigint,
                   sum(d.visits)::bigint
            from analytic.daily_visitors d
                        join analytic.visitors u on u.user_id = d.user_id
            where d.day >= @from and d.day < @to
            group by d.day
            order by d.day
            """,
            from,
            to);

        var days = new List<AnalyticsDailyStatDto>();
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                days.Add(new AnalyticsDailyStatDto(
                    Day: reader.GetFieldValue<DateOnly>(0),
                    NewUsers: reader.GetInt64(1),
                    ReturningUsers: reader.GetInt64(2),
                    TotalVisits: reader.GetInt64(3)));
            }
        }

        await using var visitorCountCommand = new NpgsqlCommand(
            "select count(*)::bigint from analytic.visitors",
            connection);
        var totalVisitors = (long)(await visitorCountCommand.ExecuteScalarAsync(cancellationToken) ?? 0L);

        return new AnalyticsSummaryDto(days, totalVisitors);
    }

    public Task<IReadOnlyList<AnalyticsUrlStatDto>> GetUrlStatsAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default)
        => QueryTopAsync(
            """
            select url, sum(count)::bigint
            from analytic.daily_backend
            where day >= @from and day < @to
            group by url
            order by sum(count) desc, url
            limit @limit
            """,
            from,
            to,
            limit,
            reader => new AnalyticsUrlStatDto(Url: reader.GetString(0), Requests: reader.GetInt64(1)),
            cancellationToken);

    public Task<IReadOnlyList<AnalyticsPageStatDto>> GetPageStatsAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default)
        => QueryTopAsync(
            """
            select page, sum(count)::bigint
            from analytic.daily_frontend
            where day >= @from and day < @to and page <> ''
            group by page
            order by sum(count) desc, page
            limit @limit
            """,
            from,
            to,
            limit,
            reader => new AnalyticsPageStatDto(Page: reader.GetString(0), Requests: reader.GetInt64(1)),
            cancellationToken);

    private async Task<IReadOnlyList<T>> QueryTopAsync<T>(string sql, DateOnly from, DateOnly to, int limit, Func<NpgsqlDataReader, T> map, CancellationToken cancellationToken)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = CreateCommand(connection, sql, from, to, limit);

        var rows = new List<T>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(map(reader));
        return rows;
    }

    private static NpgsqlCommand CreateCommand(NpgsqlConnection connection, string sql, DateOnly from, DateOnly to, int? limit = null)
    {
        var command = new NpgsqlCommand(sql, connection);
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
                create schema if not exists analytic;
                do $$
                begin
                    if to_regclass('analytic.visitors') is null and to_regclass('analytic.analytics_visitors') is not null then
                        alter table analytic.analytics_visitors rename to visitors;
                    end if;
                    if to_regclass('analytic.daily_visitors') is null and to_regclass('analytic.analytics_daily_visitors') is not null then
                        alter table analytic.analytics_daily_visitors rename to daily_visitors;
                    end if;
                    if to_regclass('analytic.daily_backend') is null and to_regclass('analytic.analytics_daily_backend') is not null then
                        alter table analytic.analytics_daily_backend rename to daily_backend;
                    end if;
                    if to_regclass('analytic.daily_frontend') is null and to_regclass('analytic.analytics_daily_frontend') is not null then
                        alter table analytic.analytics_daily_frontend rename to daily_frontend;
                    end if;
                    if to_regclass('analytic.visitors') is null and to_regclass('public.analytics_visitors') is not null then
                        alter table public.analytics_visitors set schema analytic;
                        alter table analytic.analytics_visitors rename to visitors;
                    elsif to_regclass('analytic.visitors') is null and to_regclass('public.analytics_users') is not null then
                        alter table public.analytics_users set schema analytic;
                        alter table analytic.analytics_users rename to visitors;
                    end if;
                    if to_regclass('analytic.daily_visitors') is null and to_regclass('public.analytics_daily_visitors') is not null then
                        alter table public.analytics_daily_visitors set schema analytic;
                        alter table analytic.analytics_daily_visitors rename to daily_visitors;
                    elsif to_regclass('analytic.daily_visitors') is null and to_regclass('public.analytics_daily_user') is not null then
                        alter table public.analytics_daily_user set schema analytic;
                        alter table analytic.analytics_daily_user rename to daily_visitors;
                    end if;
                    if to_regclass('analytic.daily_backend') is null and to_regclass('public.analytics_daily_backend') is not null then
                        alter table public.analytics_daily_backend set schema analytic;
                        alter table analytic.analytics_daily_backend rename to daily_backend;
                    elsif to_regclass('analytic.daily_backend') is null and to_regclass('public.analytics_daily_url') is not null then
                        alter table public.analytics_daily_url set schema analytic;
                        alter table analytic.analytics_daily_url rename to daily_backend;
                    end if;
                    if to_regclass('analytic.daily_frontend') is null and to_regclass('public.analytics_daily_frontend') is not null then
                        alter table public.analytics_daily_frontend set schema analytic;
                        alter table analytic.analytics_daily_frontend rename to daily_frontend;
                    elsif to_regclass('analytic.daily_frontend') is null and to_regclass('public.analytics_daily_page_url') is not null then
                        alter table public.analytics_daily_page_url set schema analytic;
                        alter table analytic.analytics_daily_page_url rename to daily_frontend;
                    end if;
                end $$;
                create table if not exists analytic.visitors (
                    user_id         uuid primary key,
                    first_seen_day  date not null);
                create table if not exists analytic.daily_visitors (
                    day      date   not null,
                    user_id  uuid   not null,
                    visits   bigint not null,
                    primary key (day, user_id));
                create table if not exists analytic.daily_backend (
                    day    date   not null,
                    url    text   not null,
                    count  bigint not null,
                    primary key (day, url));
                create table if not exists analytic.daily_frontend (
                    day    date   not null,
                    page   text   not null,
                    url    text   not null,
                    count  bigint not null,
                    primary key (day, page, url));
                """,
                connection,
                transaction))
            {
                await create.ExecuteNonQueryAsync(cancellationToken);
            }

            await using (var prune = new NpgsqlCommand(
                """
                delete from analytic.daily_visitors where day < (current_date - @retentionDays::int);
                delete from analytic.daily_backend where day < (current_date - @retentionDays::int);
                """,
                connection,
                transaction))
            {
                prune.Parameters.AddWithValue("retentionDays", (int)Retention.TotalDays);
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
