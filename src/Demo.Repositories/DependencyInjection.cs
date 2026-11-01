using Demo.Repositories.FileStorage;
using Demo.Contracts.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Demo.Repositories;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoRepositories(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var provider = configuration["StorageProvider"] ?? "Files";
        if (provider.Equals("Files", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<FilePathResolver>();
            services.AddSingleton<IMetadataRepository, MetadataFileRepository>();
            services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionFileRepository>();
            services.AddSingleton<IOperatorDefinitionRepository, OperatorDefinitionFileRepository>();
            services.AddSingleton<IQueryRequestRepository, QueryRequestFileRepository>();
            services.AddSingleton<IReportRepository, ReportFileRepository>();
        }
        else if (provider.Equals("Memory", StringComparison.OrdinalIgnoreCase))
        {
            //services.AddSingleton<IMetadataRepository, MetadataMemoryRepository>();
            //services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionMemoryRepository>();
            //services.AddSingleton<IReportRepository, ReportMemoryRepository>();
        }
        else
        {
            throw new InvalidOperationException(
                $"Unsupported StorageProvider '{provider}'. Supported providers are Files and Memory.");
        }

        return services;
    }
}
