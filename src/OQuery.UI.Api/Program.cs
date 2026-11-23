using Microsoft.Extensions.Options;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Application;
using OQuery.UI.Hosting;
using OQuery.UI.Storage.Postgres.Analytics;

// Sample host: the OQuery.UI library provides AddOQuery (services), UseOQuery (API + Swagger) and UseOQueryUI (embedded frontend).
var configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddUserSecrets<Program>()
    .AddEnvironmentVariables()
    .BuildTemplateConfig();

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddConfiguration(configuration);

// The host supplies the database dialects and the Postgres analytics store; the library does not reference them.
DialectModules.RegisterAll();
builder.Services.AddSingleton<IAnalyticsRepository>(sp => new PostgresAnalyticsRepository(
    sp.GetRequiredService<IOptions<OQueryOptions>>().Value.Analytics.ConnectionString
    ?? throw new InvalidOperationException("Analytics is not configured.")));

builder.Services.AddOQuery();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(swagger =>
{
    swagger.RoutePrefix = "swagger";
    swagger.SwaggerEndpoint("/swagger/v1/swagger.json", "OQuery API v1");
});

app.UseOQuery();
app.UseOQueryUI();

app.Run();
