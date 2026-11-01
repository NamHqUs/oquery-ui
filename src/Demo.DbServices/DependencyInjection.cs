using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Demo.Contracts.Services;

namespace Demo.DbServices;

public static class DependencyInjection
{
    public static IServiceCollection AddDemoDbServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<DatabaseService>();
        services.AddSingleton<IDbConnectionService, DbConnectionService>();
        services.AddSingleton<IDatabaseService>(sp => sp.GetRequiredService<DatabaseService>());

        return services;
    }
}
