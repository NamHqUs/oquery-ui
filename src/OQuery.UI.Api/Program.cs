using Microsoft.AspNetCore.HttpOverrides;
//using OQuery.UI.Storage.Files;
//using OQuery.UI.Storage.Files.FileStorage;
using OQuery.UI.Storage.Postgres;
using OQuery.UI.Storage.Postgres.Analytics;
using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Api.Services;
using OQuery.UI.Application;
using OQuery.UI.Application.Analytics;
using OQuery.UI.Application.Middlewares;
using OQuery;
using OQuery.QueryDefinitions.Parsers;
using OQuery.UnitTest.Setup;
using System.Text.Json.Serialization;

var configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddUserSecrets<Program>()
    .AddEnvironmentVariables()
    .BuildTemplateConfig();

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddConfiguration(configuration);
builder.Services.AddSingleton<IConfiguration>(configuration);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        QueryDefinitionJsonParser.Configure(options.JsonSerializerOptions);
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
    });
builder.Services.ConfigureHttpJsonOptions(options =>
{
    QueryDefinitionJsonParser.Configure(options.SerializerOptions);
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
});
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Built-in data is consumer-owned: loaded here and passed to the selected provider. Providers only load/save.
var dataSets = configuration.GetSection("OQuery:Seeds:DataSets").Get<string[]>()
    ?? throw new InvalidOperationException("Configuration 'OQuery:Seeds:DataSets' is missing.");
var seeds = BuiltinDataLoader.Load(configuration["OQuery:Seeds:BasePath"], dataSets);
var postgresConnection = configuration["OQuery:Repositories:Postgres:ConnectionString"];

//IRepositoryProvider repositoryProvider = string.IsNullOrWhiteSpace(postgresConnection)
//    ? new FileRepositoryProvider(new FilePathResolver(configuration), seeds.Domains, seeds.Queries)
//    : new PostgresRepositoryProvider(postgresConnection, seeds.Domains, seeds.Queries);

var repositoryProvider = new PostgresRepositoryProvider(postgresConnection!, seeds.Domains, seeds.Queries);
builder.Services.AddRepositoryProvider(repositoryProvider);


builder.Services.AddDemoServices();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IUserSectionManager, UserSectionManager>();

// Analytics is optional: without ConnectionStrings:Analytics, no requests are counted and admin endpoints return 503.
var analyticsConnection = configuration.GetConnectionString("Analytics");
var analyticsEnabled = !string.IsNullOrWhiteSpace(analyticsConnection);
if (analyticsEnabled)
{
    builder.Services.AddSingleton<IAnalyticsRepository>(new PostgresAnalyticsRepository(analyticsConnection!));
    builder.Services.AddSingleton<RequestUsageCollector>();
    builder.Services.AddSingleton<RequestUsageMiddleware>();
    builder.Services.AddHostedService<AnalyticsUsageFlushService>();
}

DialectModules.RegisterAll();

var app = builder.Build();

app.UseExceptionHandler();
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "swagger";
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dynamic SQL Demo v1");
});
if (analyticsEnabled)
    app.UseMiddleware<RequestUsageMiddleware>();

app.MapControllers();
app.Run();
