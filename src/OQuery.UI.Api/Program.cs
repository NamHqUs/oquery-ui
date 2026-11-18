using OQuery.UI.Storage.Files;
using OQuery.UI.Storage.Postgres;
using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Api.Services;
using OQuery.UI.Application;
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

// Built-in data is consumer-owned: loaded once here and handed to the repositories, which only load/save user data.
var dataSets = configuration.GetSection("OQuery:Seeds:DataSets").Get<string[]>()
    ?? throw new InvalidOperationException("Configuration 'OQuery:Seeds:DataSets' is missing.");
var seeds = BuiltinDataLoader.Load(configuration["OQuery:Seeds:BasePath"], dataSets);
builder.Services.AddDemoRepositories(seeds.Domains, seeds.Queries);
var postgresConnection = configuration["OQuery:Repositories:Postgres:ConnectionString"];
if (!string.IsNullOrWhiteSpace(postgresConnection))
{
    // Replaces the file-based domain and query repositories registered above.
    builder.Services.AddPostgresRepositories(postgresConnection, seeds.Domains, seeds.Queries);
}
builder.Services.AddDemoServices();
builder.Services.AddSingleton<IUserSectionManager, UserSectionManager>();

DialectModules.RegisterFromFolder(Path.GetFullPath(Path.Combine(
    Environment.CurrentDirectory,
    configuration["OQuery:DialectPackagesPath"] ?? throw new InvalidOperationException("Configuration 'OQuery:DialectPackagesPath' is missing."))));

var app = builder.Build();

app.UseExceptionHandler();
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "swagger";
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dynamic SQL Demo v1");
});
app.MapControllers();
app.Run();
