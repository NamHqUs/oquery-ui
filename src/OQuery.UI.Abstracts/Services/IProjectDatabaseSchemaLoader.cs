namespace OQuery.UI.Abstracts.Services;

/// <summary>Opens a database that is not the default connection, without changing the active connection.</summary>
public interface IProjectDatabaseSchemaLoader
{
    /// <summary>Opens and closes a connection. Throws the provider's exception with its message when the connection fails.</summary>
    void TestConnection(string provider, string connectionString);

    DatabaseSchema LoadSchema(string provider, string connectionString);
}
