using Npgsql;
using NpgsqlTypes;

namespace OQuery.UI.Storage.Postgres;

/// <summary>Stores user-defined documents only. Built-in data is held in memory by the repositories.</summary>
internal sealed class PostgresDocumentStore
{
    private readonly string _connectionString;
    private readonly string _table;
    private readonly Lock _initLock = new();
    private volatile bool _initialized;

    public PostgresDocumentStore(string connectionString, string table)
    {
        _connectionString = connectionString;
        _table = table;
    }

    public IReadOnlyList<(string Id, string Body)> List(string userSectionId)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(
            $"select id, body::text from {_table} where user_section_id = @section order by id",
            connection);
        command.Parameters.AddWithValue("section", userSectionId);

        using var reader = command.ExecuteReader();
        var rows = new List<(string Id, string Body)>();
        while (reader.Read())
            rows.Add((reader.GetString(0), reader.GetString(1)));
        return rows;
    }

    public string? Find(string userSectionId, string id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(
            $"select body::text from {_table} where user_section_id = @section and id = @id",
            connection);
        command.Parameters.AddWithValue("section", userSectionId);
        command.Parameters.AddWithValue("id", id);
        return command.ExecuteScalar() as string;
    }

    public void Upsert(string userSectionId, string id, string body)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(
            $"""
            insert into {_table} (user_section_id, id, body, updated_at)
            values (@section, @id, @body, now())
            on conflict (user_section_id, id)
            do update set body = excluded.body, updated_at = excluded.updated_at
            """,
            connection);
        command.Parameters.AddWithValue("section", userSectionId);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.Add(new NpgsqlParameter("body", NpgsqlDbType.Jsonb) { Value = body });
        command.ExecuteNonQuery();
    }

    public bool Delete(string userSectionId, string id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = new NpgsqlCommand(
            $"delete from {_table} where user_section_id = @section and id = @id",
            connection);
        command.Parameters.AddWithValue("section", userSectionId);
        command.Parameters.AddWithValue("id", id);
        return command.ExecuteNonQuery() > 0;
    }

    private void EnsureInitialized()
    {
        if (_initialized)
            return;

        lock (_initLock)
        {
            if (_initialized)
                return;

            using var connection = OpenConnection();
            using var transaction = connection.BeginTransaction();
            using (var create = new NpgsqlCommand(
                $"""
                create table if not exists {_table} (
                    user_section_id text not null,
                    id text not null,
                    body jsonb not null,
                    updated_at timestamptz not null default now(),
                    primary key (user_section_id, id))
                """,
                connection,
                transaction))
            {
                create.ExecuteNonQuery();
            }

            transaction.Commit();
            _initialized = true;
        }
    }

    private NpgsqlConnection OpenConnection()
    {
        var connection = new NpgsqlConnection(_connectionString);
        connection.Open();
        return connection;
    }
}
