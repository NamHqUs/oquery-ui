using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Storage.Files;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Services;

public static class DependencyInjection
{
    /// <summary>Registers the Domain, Query and Function repositories from the <see cref="FileRepositoryProvider"/> singleton.</summary>
    public static IServiceCollection AddFileRepositories(this IServiceCollection services)
    {
        services.AddSingleton<IDomainRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Domains);
        services.AddSingleton<IQueryRequestRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Queries);
        services.AddSingleton<IFunctionDefinitionRepository>(sp => sp.GetRequiredService<FileRepositoryProvider>().Functions);
        return services;
    }

    public static IServiceCollection AddDemoServices(this IServiceCollection services)
    {
        services.AddSingleton<IDomainService, DomainService>();
        services.AddSingleton<IFunctionDefinitionService, FunctionDefinitionService>();
        services.AddSingleton<IDynamicQueryService, DynamicQueryService>();
        services.AddSingleton<IQueryRequestService, QueryRequestService>();
        services.AddSingleton<DatabaseService>();
        services.AddSingleton<IDbConnectionService, DbConnectionService>();
        services.AddSingleton<IDatabaseService>(sp => sp.GetRequiredService<DatabaseService>());
        return services;
    }
}
