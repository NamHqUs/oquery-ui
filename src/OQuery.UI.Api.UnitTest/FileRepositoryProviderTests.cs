using Microsoft.Extensions.Configuration;
using NUnit.Framework;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Storage.Files;
using OQuery.UI.Storage.Files.FileStorage;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class FileRepositoryProviderTests
{
    private const string Section = "section-1";
    private const string BuiltinId = "builtin-domain";

    private string _root = string.Empty;
    private FileRepositoryProvider _provider = null!;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "file-provider-" + Guid.NewGuid().ToString("N"));
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["OQuery:Repositories:Files:UserData"] = _root })
            .Build();
        _provider = new FileRepositoryProvider(
            new FilePathResolver(configuration),
            [CreateDomain(BuiltinId, "Builtin", isBuiltin: true)],
            []);
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void GetAllReturnsBuiltinDomainsBeforeUserDomains()
    {
        _provider.Domains.Save(Section, CreateDomain("user-domain", "Custom", isBuiltin: false));

        var ids = _provider.Domains.GetAll(Section).Select(domain => domain.Id).ToArray();

        Assert.That(ids, Is.EqualTo(new[] { BuiltinId, "user-domain" }));
    }

    [Test]
    public void BuiltinDomainCannotBeSavedOrDeleted()
    {
        Assert.Throws<InvalidOperationException>(() =>
            _provider.Domains.Save(Section, CreateDomain(BuiltinId, "Overwrite", isBuiltin: false)));
        Assert.Throws<InvalidOperationException>(() => _provider.Domains.Delete(Section, BuiltinId));
        Assert.That(_provider.Domains.Get(Section, BuiltinId)?.Name, Is.EqualTo("Builtin"));
    }

    private static DomainDto CreateDomain(string id, string name, bool isBuiltin) => new()
    {
        Id = id,
        Name = name,
        Entities = [],
        Relations = [],
        CanDelete = !isBuiltin,
        IsBuiltin = isBuiltin,
    };
}
