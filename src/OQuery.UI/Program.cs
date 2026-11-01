using Demo.Repositories;
using Demo.DbServices;
using Demo.Contracts.Application;
using Demo.Services;
using OQuery.UI.Application.Middlewares;
using OQuery;
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
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
    });
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<DataType>());
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter<RelationType>());
});
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDemoRepositories(configuration);
builder.Services.AddDemoServices();
builder.Services.AddDemoDbServices(configuration);
builder.Services.AddSingleton<IUserSectionManager, UserSectionManager>();

var app = builder.Build();

//var service = app.Services.GetRequiredService<IQueryRequestRepository>();
//var queryRequest = service.GetBuiltin();
//foreach (var request in queryRequest)
//    service.Save("builtin", request);

app.UseExceptionHandler();
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "";
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dynamic SQL Demo v1");
});
app.MapControllers();
app.Run();
