using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Storage.Postgres;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the Postgres domain and query repositories. The caller supplies the built-in rows
    /// that are seeded once into each table.
    /// </summary>
    public static IServiceCollection AddPostgresRepositories(
        this IServiceCollection services,
        string connectionString,
        IReadOnlyCollection<DomainDto> builtinDomains,
        IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.AddSingleton<IDomainRepository>(
            new PostgresDomainRepository(connectionString, builtinDomains));
        services.AddSingleton<IQueryRequestRepository>(
            new PostgresQueryRequestRepository(connectionString, builtinQueries));

        return services;
    }
}
