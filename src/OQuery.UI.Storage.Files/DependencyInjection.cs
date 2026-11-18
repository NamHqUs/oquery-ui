using OQuery.UI.Storage.Files.FileStorage;
using OQuery.UI.Abstracts.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Storage.Files;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoRepositories(this IServiceCollection services)
    {
        services.AddSingleton<FilePathResolver>();
        services.AddSingleton<IMetadataRepository, MetadataFileRepository>();
        services.AddSingleton<IDomainRepository, DomainFileRepository>();
        services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionFileRepository>();
        services.AddSingleton<IQueryRequestRepository, QueryRequestFileRepository>();

        return services;
    }
}
