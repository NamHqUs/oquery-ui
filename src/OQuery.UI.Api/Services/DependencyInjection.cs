using OQuery.UI.Abstracts.Services;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Api.Services;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoServices(this IServiceCollection services)
    {
        services.AddSingleton<IMetadataService, MetadataService>();
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
