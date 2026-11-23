using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Storage.Files;

namespace OQuery.UI.Services;

public static class DependencyInjection
{
    /// <summary>Registers the Project, Query and Function repositories from the <see cref="FileRepositoryProvider"/> singleton.</summary>
    public static IServiceCollection AddFileRepositories(this IServiceCollection services)
    {
        services.AddSingleton<IProjectRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Projects);
        services.AddSingleton<IQueryRequestRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Queries);
        services.AddSingleton<IFunctionDefinitionRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Functions);
        services.AddSingleton<IPlaygroundRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Playgrounds);
        return services;
    }

    public static IServiceCollection AddDemoServices(this IServiceCollection services)
    {
        services.AddSingleton<IProjectService, ProjectService>();
        services.AddSingleton<IConnectionStringProtector, AesGcmConnectionStringProtector>();
        services.AddSingleton<IProjectDatabaseSchemaLoader, ProjectDatabaseSchemaLoader>();
        services.AddSingleton<IFunctionDefinitionService, FunctionDefinitionService>();
        services.AddSingleton<IDynamicQueryService, DynamicQueryService>();
        services.AddSingleton<IQueryRequestService, QueryRequestService>();
        services.AddSingleton<IPlaygroundService, PlaygroundService>();
        services.AddSingleton<DatabaseService>();
        services.AddSingleton<IDbConnectionService, DbConnectionService>();
        services.AddSingleton<IDatabaseService>(sp => sp.GetRequiredService<DatabaseService>());
        return services;
    }
}
