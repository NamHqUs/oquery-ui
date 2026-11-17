using System.Text.Json;
using Demo.Contracts.Application;
using Demo.Contracts.Services;
using Demo.DbServices;
using Demo.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NUnit.Framework;

namespace Demo.Services.UnitTest;

[TestFixture]
public sealed class SavedQueryRawTextTests
{
    private const string SectionId = "123";
    private static readonly string RepositoryRoot = FindRepositoryRoot();
    private static readonly string QueriesFolder = Path.Combine(RepositoryRoot, "data-storage", "UserData", SectionId, "queries");

    private ServiceProvider? _serviceProvider;
    private IDynamicQueryService _dynamicQueryService = null!;

    public static IEnumerable<TestCaseData> SavedRawTextQueries()
    {
        foreach (var file in Directory.EnumerateFiles(QueriesFolder, "*.json").OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            using var document = JsonDocument.Parse(File.ReadAllText(file));
            var root = document.RootElement;

            if (!root.TryGetProperty("rawText", out var rawTextElement)
                || rawTextElement.ValueKind != JsonValueKind.String
                || string.IsNullOrWhiteSpace(rawTextElement.GetString()))
            {
                continue;
            }

            yield return new TestCaseData(
                    root.GetProperty("domainId").GetString(),
                    rawTextElement.GetString())
                .SetName(Path.GetFileNameWithoutExtension(file));
        }
    }

    [OneTimeSetUp]
    public void OneTimeSetUp()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["StorageProvider"] = "Files",
                ["FileStoragePath"] = Path.Combine(RepositoryRoot, "data-storage"),
                ["MetadataPath"] = Path.Combine(RepositoryRoot, "oquery", "data-storage", "metadata"),
                ["DbProvider:DefaultDbOption:Provider"] = "Sqlite",
                ["DbProvider:DefaultDbOption:ConnectionString"] = "Data Source=:memory:",
                ["DbProvider:DBVersion"] = "1",
                ["DbProvider:DbScriptsPath"] = Path.Combine(RepositoryRoot, "oquery", "data-storage", "scripts"),
                ["DbProvider:UseCases:0"] = "northstar-demo",
                ["DbProvider:UseCases:1"] = "unit-test",
            })
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Warning));
        services.AddSingleton<IUserSectionManager>(new FixedUserSectionManager(SectionId));
        services.AddDemoRepositories(configuration);
        services.AddDemoDbServices(configuration);
        services.AddDemoServices();

        _serviceProvider = services.BuildServiceProvider();
        _dynamicQueryService = _serviceProvider.GetRequiredService<IDynamicQueryService>();
    }

    [OneTimeTearDown]
    public void OneTimeTearDown() => _serviceProvider?.Dispose();

    [TestCaseSource(nameof(SavedRawTextQueries))]
    public async Task RawTextQueryExecutesSuccessfully(string domainId, string rawText)
    {
        var query = _dynamicQueryService.ParseQueryRequestString(rawText);

        var result = await _dynamicQueryService.ExecuteQueryAsync(query, domainId);

        Assert.That(result, Is.Not.Null);
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (Directory.Exists(Path.Combine(directory.FullName, "data-storage"))
                && Directory.Exists(Path.Combine(directory.FullName, "oquery")))
            {
                return directory.FullName;
            }
        }

        throw new DirectoryNotFoundException("Could not locate the repository root containing data-storage and oquery.");
    }

    private sealed class FixedUserSectionManager(string sectionId) : IUserSectionManager
    {
        public string GetSectionId() => sectionId;
    }
}
