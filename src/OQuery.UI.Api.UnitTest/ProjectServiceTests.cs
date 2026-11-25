using NUnit.Framework;
using Microsoft.Extensions.Options;
using OQuery;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery.UI.Hosting;
using OQuery.UI.Services;
using OQuery.UI.Storage.Files;
using OQuery.UI.Storage.Files.FileStorage;
using System.Text.Json;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class ProjectServiceTests
{
    private const string Section = "section-1";

    private string _root = string.Empty;
    private FileRepositoryProvider _provider = null!;
    private FakeSchemaLoader _loader = null!;
    private ProjectService _service = null!;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "project-service-" + Guid.NewGuid().ToString("N"));
        _provider = new FileRepositoryProvider(new FilePathResolver(_root), []);
        _loader = new FakeSchemaLoader();
        var protector = new AesGcmConnectionStringProtector(Options.Create(new OQueryOptions
        {
            Security = new OQueryOptions.SecurityOptions { EncryptionKey = "test-secret" },
        }));
        _service = new ProjectService(_provider.Projects, new FixedSection(), new NoDatabase(), protector, _loader, _provider.Queries, _provider.Playgrounds);
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void UpdateDomainStoresEditedMappingsAndRejectsRelationToUnknownEntity()
    {
        _loader.Schema = CreateSchema("Clients", "Policies");
        var project = _service.CreateFromDatabase(new ProjectFromDatabaseRequestDto("Sales", "", "Sqlite", "Data Source=sales.db"));
        var main = project.Domains.Single();
        var edited = new DomainDto { Id = main.Id, Name = main.Name, Entities = main.Entities.ToList(), Relations = [] };
        edited.Entities[0].Fields[0] = edited.Entities[0].Fields[0] with { DataType = DataType.Number };
        edited.Relations.Add(new RelationDto
        {
            SourceEntity = "Clients",
            SourceRelationName = "Policies",
            SourceFields = ["id"],
            TargetEntity = "Policies",
            TargetRelationName = "Client",
            TargetFields = ["client_id"],
        });

        var saved = _service.UpdateDomain(project.Id, main.Id, edited);

        Assert.That(_service.GetDomain(project.Id, main.Id).Relations.Single().TargetEntity, Is.EqualTo("Policies"));
        Assert.That(saved.Entities[0].Fields[0].DataType, Is.EqualTo(DataType.Number));

        edited.Relations[0] = edited.Relations[0] with { TargetEntity = "Missing" };
        var ex = Assert.Throws<ArgumentException>(() => _service.UpdateDomain(project.Id, main.Id, edited));
        Assert.That(ex!.Message, Does.Contain("Missing"));
    }

    [Test]
    public void CreateFromDatabaseStoresEncryptedConnectionAndMainDomain()
    {
        _loader.Schema = CreateSchema("Clients", "Policies");

        var project = _service.CreateFromDatabase(new ProjectFromDatabaseRequestDto("Sales", "the first project", "Sqlite", "Data Source=sales.db"));

        Assert.That(project.DbProvider, Is.EqualTo("Sqlite"));
        var main = project.Domains.Single();
        Assert.That(main.Name, Is.EqualTo("Main"));
        Assert.That(main.Description, Is.EqualTo("Meta is mirrored from Database Schema"));
        Assert.That(main.Entities.Select(entity => entity.Name), Is.EqualTo(new[] { "Clients", "Policies" }));

        var stored = _provider.Projects.Get(Section, project.Id)!;
        Assert.That(stored.Connection!.EncryptedConnectionString, Is.Not.Empty.And.Not.Contain("sales.db"));
        Assert.That(_service.GetAll().Single().Connection!.EncryptedConnectionString, Is.Empty);
    }

    [Test]
    public void CreateFromDatabaseWritesNothingWhenTheConnectionFails()
    {
        _loader.Error = new InvalidOperationException("Login failed for user 'sa'.");

        var error = Assert.Throws<InvalidOperationException>(() =>
            _service.CreateFromDatabase(new ProjectFromDatabaseRequestDto("Sales", "", "Sqlite", "Data Source=sales.db")));

        Assert.That(error!.Message, Is.EqualTo("Login failed for user 'sa'."));
        Assert.That(_service.GetAll(), Is.Empty);
    }

    [Test]
    public void CreateFromDatabaseRejectsADatabaseWithoutTables()
    {
        _loader.Schema = new DatabaseSchema([], []);

        Assert.Throws<InvalidOperationException>(() =>
            _service.CreateFromDatabase(new ProjectFromDatabaseRequestDto("Empty", "", "Sqlite", "Data Source=empty.db")));

        Assert.That(_service.GetAll(), Is.Empty);
    }

    [Test]
    public void CreateDomainRejectsRelationToAnEntityOutsideIt()
    {
        var project = _service.Create(new ProjectFileDto("", "Sales", "", "Profile"));

        Assert.Throws<ArgumentException>(() => _service.CreateDomain(project.Id, new DomainDto
        {
            Name = "Clients only",
            Entities = [new EntityDto("Clients", [new Field("Id", "Id", DataType.Number)], "Users") { DbTable = "Users" }],
            Relations =
            [
                new RelationDto
                {
                    SourceEntity = "Clients",
                    SourceRelationName = "Policies",
                    SourceFields = ["Id"],
                    TargetEntity = "Policies",
                    TargetRelationName = "Client",
                    TargetFields = ["Id"],
                },
            ],
        }));
    }

    [Test]
    public void ImportKeepsFreeProjectIdAndStoresQueriesAndPlaygrounds()
    {
        var imported = _service.Import(ImportRequest("abc123", "Imported"));

        Assert.That(imported.Id, Is.EqualTo("abc123"));
        Assert.That(imported.Domains.Single().Id, Is.EqualTo("main"));
        var scope = new StorageScope(Section, imported.Id);
        Assert.That(_provider.Queries.GetAll(scope).Select(query => query.Id), Is.EqualTo(new[] { "q1" }));
        Assert.That(_provider.Playgrounds.GetAll(scope, "main").Select(playground => playground.Name), Is.EqualTo(new[] { "P" }));
    }

    [Test]
    public void ImportAssignsNewIdWhenTheProjectIdIsTaken()
    {
        _service.Import(ImportRequest("abc123", "Imported"));

        var copy = _service.Import(ImportRequest("abc123", "Imported copy"));

        Assert.That(copy.Id, Is.Not.EqualTo("abc123"));
        Assert.That(_service.GetAll().Select(project => project.Name), Is.EquivalentTo(new[] { "Imported", "Imported copy" }));
    }

    [Test]
    public void ImportRejectsAConnectionEncryptedWithAnotherKeyAndWritesNothing()
    {
        var foreignProtector = new AesGcmConnectionStringProtector(Options.Create(new OQueryOptions
        {
            Security = new OQueryOptions.SecurityOptions { EncryptionKey = "another-server-key" },
        }));
        var request = ImportRequest("", "Sales") with
        {
            Project = new ProjectFileDto("", "Sales", "", "")
            {
                Connection = new ProjectConnectionDto("Sqlite", foreignProtector.Protect("Data Source=sales.db")),
            },
        };

        var error = Assert.Throws<InvalidOperationException>(() => _service.Import(request));

        Assert.That(error!.Message, Does.Contain("another server key"));
        Assert.That(_service.GetAll(), Is.Empty);
    }

    [Test]
    public void ImportRejectsAPlaygroundOfADomainNotInTheProject()
    {
        var request = ImportRequest("", "Sales") with
        {
            Playgrounds = [new PlaygroundDto("Clients") { DomainId = "missing", Id = "p1" }],
        };

        Assert.Throws<ArgumentException>(() => _service.Import(request));

        Assert.That(_service.GetAll(), Is.Empty);
    }

    private static ProjectImportDto ImportRequest(string projectId, string name)
        => new(
            new ProjectFileDto(projectId, name, "", ""),
            [new DomainDto
            {
                Id = "main",
                Name = "Main",
                Entities = [new EntityDto("Clients", [new Field("Id", "Id", DataType.Number)], "Clients") { DbTable = "Clients" }],
                Relations = [],
            }],
            [JsonDocument.Parse("{\"id\":\"q1\",\"name\":\"All clients\"}").RootElement],
            [new PlaygroundDto("Clients") { DomainId = "main", Id = "p1", Name = "P" }]);

    private static DatabaseSchema CreateSchema(params string[] tables)
        => new(
            tables.Select(name => new DatabaseTable("dbo", name, [new DatabaseColumn("Id", "int", true, false)])).ToArray(),
            []);

    private sealed class FakeSchemaLoader : IProjectDatabaseSchemaLoader
    {
        public DatabaseSchema Schema { get; set; } = new([], []);
        public Exception? Error { get; set; }

        public void TestConnection(string provider, string connectionString)
        {
            if (Error is not null) throw Error;
        }

        public DatabaseSchema LoadSchema(string provider, string connectionString)
            => Error is null ? Schema : throw Error;
    }

    private sealed class FixedSection : IUserSectionManager
    {
        public string GetSectionId() => Section;
    }

    private sealed class NoDatabase : IDatabaseService
    {
        public void Connect(string provider, string connectionString) { }
        public DatabaseSchema GetDatabaseSchema() => throw new NotSupportedException();
        public DatabaseTableData GetTableData(string tableName, string? schema = null, int? limit = null) => throw new NotSupportedException();
    }
}
