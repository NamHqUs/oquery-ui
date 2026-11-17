using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Api.Database;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoDbServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        DialectModules.RegisterAll();

        services.AddSingleton<DatabaseService>();
        services.AddSingleton<IDbConnectionService, DbConnectionService>();
        services.AddSingleton<IDatabaseService>(sp => sp.GetRequiredService<DatabaseService>());

        return services;
    }
}
