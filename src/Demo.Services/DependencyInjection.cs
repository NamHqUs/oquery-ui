using Demo.Contracts.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Demo.Services;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoServices(this IServiceCollection services)
    {
        services.AddSingleton<IMetadataService, MetadataService>();
        services.AddSingleton<IFunctionDefinitionService, FunctionDefinitionService>();
        services.AddSingleton<IOperatorDefinitionService, OperatorDefinitionService>();
        services.AddSingleton<IDynamicQueryService, DynamicQueryService>();
        services.AddSingleton<IReportService, ReportService>();
        services.AddSingleton<IQueryRequestService, QueryRequestService>();
        return services;
    }
}
