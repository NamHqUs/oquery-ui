using OQuery.UI.Storage.Files.FileStorage;
using OQuery.UI.Abstracts.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace OQuery.UI.Storage.Files;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoRepositories(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var provider = configuration["Setup:StorageProvider"] ?? "Files";
        if (provider.Equals("Files", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<FilePathResolver>();
            services.AddSingleton<IMetadataRepository, MetadataFileRepository>();
            services.AddSingleton<IDomainRepository, DomainFileRepository>();
            services.AddSingleton<IFunctionDefinitionRepository, FunctionDefinitionFileRepository>();
            services.AddSingleton<IQueryRequestRepository, QueryRequestFileRepository>();
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
