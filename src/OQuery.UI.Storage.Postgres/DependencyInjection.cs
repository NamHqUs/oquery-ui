using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Storage.Postgres;

public static class DependencyInjection
{
    public static IServiceCollection AddPostgresRepositories(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("OQueryStore")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:OQueryStore is required when Setup:StorageProvider is Postgres.");

        services.AddSingleton<FilePathResolver>();
        services.AddSingleton<IMetadataRepository, MetadataFileRepository>();
        services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionFileRepository>();
        services.AddSingleton<IOperatorDefinitionRepository, OperatorDefinitionFileRepository>();
        services.AddSingleton<IDomainRepository>(sp =>
            new PostgresDomainRepository(connectionString, sp.GetRequiredService<FilePathResolver>()));
        services.AddSingleton<IQueryRequestRepository>(sp =>
            new PostgresQueryRequestRepository(connectionString, sp.GetRequiredService<FilePathResolver>()));

        return services;
    }
}
