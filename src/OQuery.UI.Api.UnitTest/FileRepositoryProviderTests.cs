using Microsoft.Extensions.Configuration;
using NUnit.Framework;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files;
using OQuery.UI.Storage.Files.FileStorage;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class FileRepositoryProviderTests
{
    private const string Section = "section-1";

    private string _root = string.Empty;
    private FileRepositoryProvider _provider = null!;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "file-provider-" + Guid.NewGuid().ToString("N"));
        _provider = new FileRepositoryProvider(new FilePathResolver(_root), []);
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void ProjectIsStoredAsFolderNamedByItsIdWithProjectJson()
    {
        _provider.Projects.Save(Section, new ProjectFileDto("p1", "Sales", "Desc", "Profile-A"));

        var path = Path.Combine(_root, Section, "projects", "p1", "project.json");
        Assert.That(File.Exists(path), Is.True);
        Assert.That(_provider.Projects.Get(Section, "p1")?.DbConnectionProfile, Is.EqualTo("Profile-A"));
    }

    [Test]
    public void ProjectNamesMustBeUniqueWithinSection()
    {
        _provider.Projects.Save(Section, new ProjectFileDto("p1", "Sales", "", ""));

        Assert.Throws<InvalidOperationException>(() =>
            _provider.Projects.Save(Section, new ProjectFileDto("p2", "sales", "", "")));
    }

    [Test]
    public void DomainFilesAndFullDomainLiveInsideTheProjectFolder()
    {
        _provider.Projects.Save(Section, new ProjectFileDto("p1", "Sales", "", ""));
        _provider.Projects.SaveFullDomain(Section, "p1", new FullDomainDto());
        _provider.Projects.SaveDomain(Section, "p1", new DomainDto { Id = "d1", Name = "Sub" });

        Assert.That(_provider.Projects.GetFullDomain(Section, "p1"), Is.Not.Null);
        Assert.That(_provider.Projects.GetDomains(Section, "p1").Select(domain => domain.Name), Is.EqualTo(new[] { "Sub" }));
        Assert.That(File.Exists(Path.Combine(_root, Section, "projects", "p1", "domains", "fulldomain.json")), Is.True);
    }

    [Test]
    public void FullDomainIdIsReservedForSubDomains()
    {
        _provider.Projects.Save(Section, new ProjectFileDto("p1", "Sales", "", ""));

        Assert.Throws<ArgumentException>(() =>
            _provider.Projects.SaveDomain(Section, "p1", new DomainDto { Id = "fulldomain", Name = "Bad" }));
    }

    [Test]
    public void QueriesAreScopedToTheirProject()
    {
        var record = new QueryRequestRecordDto("q1", """{ "id": "q1", "name": "Q1" }""", false);
        _provider.Queries.Save(new StorageScope(Section, "p1"), record);

        Assert.That(_provider.Queries.Get(new StorageScope(Section, "p1"), "q1"), Is.Not.Null);
        Assert.That(_provider.Queries.Get(new StorageScope(Section, "p2"), "q1"), Is.Null);
    }
}
