using Microsoft.Extensions.Configuration;
using NUnit.Framework;
using OQuery;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Storage.Files.FileStorage;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class FunctionDefinitionFileRepositoryTests
{
    private const string Section = "section-1";
    private const string FunctionName = "TestDouble";

    private string _root = string.Empty;
    private string _functionsRoot = string.Empty;
    private FunctionDefinitionFileRepository _repository = null!;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "function-definitions-" + Guid.NewGuid().ToString("N"));
        _functionsRoot = Path.Combine(_root, Section, "functions");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["OQuery:Repositories:Files:UserData"] = _root })
            .Build();
        _repository = new FunctionDefinitionFileRepository(new FilePathResolver(configuration));
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void SaveWritesOneFilePerDatabaseFolderAndGetMergesTheTemplates()
    {
        _repository.Save(Section, CreateFunction(new Dictionary<string, string>
        {
            ["Sqlite"] = "{value} * 2",
            ["SqlServer"] = "{value} * 2",
        }));

        var folders = Directory.GetDirectories(_functionsRoot).Select(Path.GetFileName);
        Assert.That(folders, Is.EquivalentTo(new[] { "Sqlite", "SqlServer" }));

        var definition = _repository.Get(Section, FunctionName);
        Assert.That(definition, Is.Not.Null);
        Assert.That(definition!.SqlTemplates.Keys, Is.EquivalentTo(new[] { "Sqlite", "SqlServer" }));
    }

    [Test]
    public void DeleteRemovesTheFunctionFromEveryDatabaseFolder()
    {
        _repository.Save(Section, CreateFunction(new Dictionary<string, string>
        {
            ["Sqlite"] = "{value} * 2",
            ["SqlServer"] = "{value} * 2",
        }));

        Assert.That(_repository.Delete(Section, FunctionName), Is.True);
        Assert.That(_repository.Get(Section, FunctionName), Is.Null);
        Assert.That(Directory.EnumerateFiles(_functionsRoot, "*.json", SearchOption.AllDirectories), Is.Empty);
    }

    private static FunctionDefinitionDto CreateFunction(IReadOnlyDictionary<string, string> templates)
        => new()
        {
            Name = FunctionName,
            Arguments = [new FunctionArgumentDefinitionDto { Name = "value", DataType = DataType.Number }],
            ResultType = nameof(DataType.Number),
            Description = "Doubles a number.",
            SqlTemplates = new Dictionary<string, string>(templates, StringComparer.OrdinalIgnoreCase),
        };
}
