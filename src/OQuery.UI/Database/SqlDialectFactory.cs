namespace OQuery.Database;

public static class SqlDialectFactory
{
    public static ISqlDialect ForProvider(string provider)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        return SqlDialectRegistry.CreateForProvider(provider);
    }
}
