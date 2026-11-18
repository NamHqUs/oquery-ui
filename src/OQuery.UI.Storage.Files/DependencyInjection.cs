using OQuery.UI.Storage.Files.FileStorage;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using Microsoft.Extensions.DependencyInjection;
using OQuery;

namespace OQuery.UI.Storage.Files;

public static class DependencyInjection
{
    /// <summary>
    /// Registers file-based repositories. Built-in collections are supplied by the consumer
    /// (API or tests); the repositories only load and save user-defined items.
    /// </summary>
    public static IServiceCollection AddDemoRepositories(
        this IServiceCollection services,
        IReadOnlyCollection<DomainDto> builtinDomains,
        IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        services.AddSingleton<FilePathResolver>();
        services.AddSingleton<IMetadataRepository>(sp =>
            new MetadataFileRepository(sp.GetRequiredService<FilePathResolver>()));
        services.AddSingleton<IDomainRepository>(sp =>
            new DomainFileRepository(sp.GetRequiredService<FilePathResolver>(), builtinDomains));
        services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionFileRepository>();
        services.AddSingleton<IQueryRequestRepository>(sp =>
            new QueryRequestFileRepository(sp.GetRequiredService<FilePathResolver>(), builtinQueries));

        return services;
    }
}
