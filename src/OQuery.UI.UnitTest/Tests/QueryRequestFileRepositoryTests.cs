using Demo.Contracts.Application;
using Demo.Repositories.FileStorage;
using Demo.Services;
using Microsoft.Extensions.Configuration;
using Demo.Contracts.Dto;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UI.UnitTest.Tests;

[TestFixture]
public sealed class QueryRequestFileRepositoryTests
{
    private string _storagePath = null!;
    private QueryRequestFileRepository _repository = null!;

    [SetUp]
    public void SetUp()
    {
        _storagePath = Path.Combine(Path.GetTempPath(), $"oquery-query-tests-{Guid.NewGuid():N}");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FileStoragePath"] = _storagePath
            })
            .Build();
        _repository = new QueryRequestFileRepository(new FilePathResolver(configuration));
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_storagePath))
            Directory.Delete(_storagePath, recursive: true);
    }

    [Test]
    public void PackagedSamplesLoadAsBuiltinsWithoutChangingFilesOrCreatingUserStorage()
    {
        var sampleDirectory = Path.Combine(AppContext.BaseDirectory, "BuiltinQueries");
        var files = Directory.GetFiles(sampleDirectory, "*.json")
            .ToDictionary(path => path, File.ReadAllText);

        var queries = _repository.GetBuiltin();
        var service = new QueryRequestService(_repository, new StubUserSectionManager("other-section"));

        Assert.Multiple(() =>
        {
            Assert.That(files, Has.Count.EqualTo(30));
            Assert.That(queries, Has.Count.EqualTo(files.Count));
            Assert.That(queries.All(query => query.IsBuiltin), Is.True);
            Assert.That(queries.Select(query => query.Id).Distinct().Count(), Is.EqualTo(files.Count));
            Assert.That(service.List(), Has.Count.EqualTo(files.Count));
            Assert.That(_repository.GetUserDefined("123"), Is.Empty);
            Assert.That(Directory.Exists(_storagePath), Is.False);
            foreach (var file in files)
                Assert.That(File.ReadAllText(file.Key), Is.EqualTo(file.Value), Path.GetFileName(file.Key));
        });
    }

    [Test]
    public void BuiltinsCannotBeChangedButCustomQueriesRemainEditableAndSectionScoped()
    {
        var service = new QueryRequestService(_repository, new StubUserSectionManager("123"));
        var builtin = _repository.GetBuiltin().First();
        var id = builtin.Id;

        Assert.Multiple(() =>
        {
            Assert.That(service.Get(id)?.Id, Is.EqualTo(id));
            Assert.That(service.IsBuiltin(id), Is.True);
            Assert.That(() => service.Update(id, builtin), Throws.InvalidOperationException);
            Assert.That(service.Delete(id), Is.False);
            Assert.That(() => service.Create(builtin), Throws.InvalidOperationException);
        });

        var custom = service.Create(builtin with { Name = "Custom sample copy" });
        var updated = custom with { Name = "Updated custom sample" };

        Assert.Multiple(() =>
        {
            Assert.That(custom.IsBuiltin, Is.False);
            Assert.That(_repository.GetUserDefined("123"), Has.Count.EqualTo(1));
            Assert.That(_repository.GetUserDefined("other-section"), Is.Empty);
            Assert.That(service.Update(custom.Id, updated), Is.EqualTo(updated));
            Assert.That(service.Get(custom.Id)?.Name, Is.EqualTo(updated.Name));
            Assert.That(service.Delete(custom.Id), Is.True);
            Assert.That(service.Get(custom.Id), Is.Null);
            Assert.That(service.Get(id)?.IsBuiltin, Is.True);
        });
    }

    [Test]
    public void SavingAndReloadingPreservesOmittedOQueryJoinTypes()
    {
        var parsed = new QueryDefinition
        {
            Entity = "User",
            Relations = [new RelationDefinition("Managers", JoinType: null)],
            Contexts = new Dictionary<string, QueryDefinitionBase>
            {
                ["Managers"] = new QueryDefinition
                {
                    Entity = "User",
                    Relations = [new RelationDefinition("Managers", JoinType: null)]
                }
            }
        };
        var request = new QueryDto
        {
            Id = "null-join",
            Name = "Null joins",
            Entity = parsed.Entity,
            Relations = parsed.Relations,
            Contexts = parsed.Contexts
        };
        _repository.Save("123", request);

        var reloaded = _repository.Get("123", request.Id)
            ?? throw new InvalidOperationException("The saved request was not found.");
        Assert.That(reloaded.Relations!.Single().JoinType, Is.Null);
        Assert.That(reloaded.Contexts!["Managers"].Relations!.Single().JoinType, Is.Null);
        Assert.That(OQueryDefinitionParser.Write(reloaded), Does.Not.Contain("JoinType:"));
    }

    private sealed class StubUserSectionManager(string sectionId) : IUserSectionManager
    {
        public string GetSectionId() => sectionId;
    }
}
