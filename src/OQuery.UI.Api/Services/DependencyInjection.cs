using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Api.Services;

public static class DependencyInjection
{
    /// <summary>Registers the repositories of the selected provider (File or Postgres).</summary>
    public static IServiceCollection AddRepositoryProvider(this IServiceCollection services, IRepositoryProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);
        services.AddSingleton<IDomainRepository>(provider.Domains);
        services.AddSingleton<IQueryRequestRepository>(provider.Queries);
        services.AddSingleton<IFunctionDefinitionRepository>(provider.Functions);
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
