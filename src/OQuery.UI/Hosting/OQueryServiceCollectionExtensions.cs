using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OQuery;
using OQuery.QueryDefinitions.Parsers;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Services;
using OQuery.UI.Application;
using OQuery.UI.Application.Analytics;
using OQuery.UI.Application.Middlewares;
using OQuery.UI.Storage.Files;
using OQuery.UI.Storage.Files.FileStorage;
using System.Text.Json.Serialization;

namespace OQuery.UI.Hosting;

public static class OQueryServiceCollectionExtensions
{
    /// <summary>
    /// Registers the OQuery backend. Settings are bound from the "OQuery" configuration section first,
    /// then <paramref name="configure"/> overrides them.
    /// </summary>
    public static IServiceCollection AddOQuery(this IServiceCollection services, Action<OQueryOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddOptions<OQueryOptions>()
            .BindConfiguration(OQueryOptions.ConfigurationSection)
            .Configure<IConfiguration>((options, configuration) =>
                options.Analytics.ConnectionString ??= configuration.GetConnectionString("Analytics"))
            .Configure(options => configure?.Invoke(options))
            .Validate(options => !string.IsNullOrWhiteSpace(options.Repositories.Files.UserData),
                "OQuery:Repositories:Files:UserData is required.")
            .Validate(options => options.Seeds.DataSets is not null,
                "OQuery:Seeds:DataSets is required.")
            .ValidateOnStart();

        services.AddSingleton(sp => CreateFileRepositoryProvider(sp.GetRequiredService<IOptions<OQueryOptions>>().Value));
        services.AddFileRepositories();
        services.AddDemoServices();
        services.AddHttpContextAccessor();
        services.AddSingleton<IUserSectionManager, UserSectionManager>();

        // Analytics is optional. Its services are always registered, but nothing is written unless Analytics.IsEnabled.
        // The host registers the IAnalyticsRepository implementation (for example PostgresAnalyticsRepository).
        services.AddSingleton<RequestUsageCollector>();
        services.AddSingleton<RequestUsageMiddleware>();
        services.AddHostedService<AnalyticsUsageFlushService>();

        services.AddOptions<MvcOptions>()
            .Configure<IOptions<OQueryOptions>>((mvc, options) =>
                ApiRoutePrefix.Apply(mvc, ApiRoutePrefix.Normalize(options.Value.Api.BasePath)));

        services
            .AddControllers()
            .AddApplicationPart(typeof(OQueryServiceCollectionExtensions).Assembly)
            .AddJsonOptions(options =>
            {
                QueryDefinitionJsonParser.Configure(options.JsonSerializerOptions);
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
            });
        services.ConfigureHttpJsonOptions(options =>
        {
            QueryDefinitionJsonParser.Configure(options.SerializerOptions);
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
        });
        services.AddProblemDetails();
        services.AddExceptionHandler<ApiExceptionHandler>();

        return services;
    }

    // Domains, Queries and Function definitions are file-based. Built-in data is consumer-owned: loaded here and passed to the file provider.
    private static FileRepositoryProvider CreateFileRepositoryProvider(OQueryOptions options)
    {
        var seeds = BuiltinDataLoader.Load(options.Seeds.BasePath, options.Seeds.DataSets!);
        return new FileRepositoryProvider(
            new FilePathResolver(options.Repositories.Files.UserData!),
            seeds.Domains,
            seeds.Queries);
    }
}
