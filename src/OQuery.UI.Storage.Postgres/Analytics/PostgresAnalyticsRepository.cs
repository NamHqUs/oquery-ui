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
            insert into analytics_users (user_id, first_seen_day)
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
            insert into analytics_daily_user (day, user_id, visits)
            select t.day, t.user_id, t.visits
            from unnest(@days::date[], @userIds::uuid[], @visits::bigint[]) as t(day, user_id, visits)
            on conflict (day, user_id)
            do update set visits = analytics_daily_user.visits + excluded.visits
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
            insert into analytics_daily_url (day, url, count)
            select t.day, t.url, t.count
            from unnest(@days::date[], @urls::text[], @counts::bigint[]) as t(day, url, count)
            on conflict (day, url)
            do update set count = analytics_daily_url.count + excluded.count
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
            insert into analytics_daily_page_url (day, page, url, count)
            select t.day, t.page, t.url, t.count
            from unnest(@days::date[], @pages::text[], @urls::text[], @counts::bigint[]) as t(day, page, url, count)
            on conflict (day, page, url)
            do update set count = analytics_daily_page_url.count + excluded.count
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
            from analytics_daily_user d
            join analytics_users u on u.user_id = d.user_id
            where d.day >= @from and d.day < @to
            group by d.day
            order by d.day
            """,
            from,
            to);

        var days = new List<AnalyticsDailyStatDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            days.Add(new AnalyticsDailyStatDto(
                Day: reader.GetFieldValue<DateOnly>(0),
                NewUsers: reader.GetInt64(1),
                ReturningUsers: reader.GetInt64(2),
                TotalVisits: reader.GetInt64(3)));
        }

        return new AnalyticsSummaryDto(days);
    }

    public async Task<IReadOnlyList<AnalyticsUrlStatDto>> GetUrlStatsAsync(DateOnly from, DateOnly to, int limit, CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);
        await using var connection = await _dataSource.OpenConnectionAsync(cancellationToken);
        await using var command = CreateCommand(
            connection,
            """
            select url, page, sum(count)::bigint
            from analytics_daily_page_url
            where day >= @from and day < @to
            group by url, page
            order by sum(count) desc, url, page
            limit @limit
            """,
            from,
            to,
            limit);

        var rows = new List<AnalyticsUrlStatDto>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new AnalyticsUrlStatDto(
                Url: reader.GetString(0),
                Page: reader.GetString(1),
                Requests: reader.GetInt64(2)));
        }
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
                create table if not exists analytics_users (
                    user_id         uuid primary key,
                    first_seen_day  date not null);
                create table if not exists analytics_daily_user (
                    day      date   not null,
                    user_id  uuid   not null,
                    visits   bigint not null,
                    primary key (day, user_id));
                create table if not exists analytics_daily_url (
                    day    date   not null,
                    url    text   not null,
                    count  bigint not null,
                    primary key (day, url));
                create table if not exists analytics_daily_page_url (
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
                delete from analytics_daily_user where day < (current_date - @retentionDays::int);
                delete from analytics_daily_url where day < (current_date - @retentionDays::int);
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
