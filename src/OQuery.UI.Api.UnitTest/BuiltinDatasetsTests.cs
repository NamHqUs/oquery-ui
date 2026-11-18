using OQuery.UI.Abstracts;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class BuiltinDatasetsTests
{
    private string _root = string.Empty;
    private string _northstarQueries = string.Empty;
    private string _unitTestQueries = string.Empty;
    private string _northstarScripts = string.Empty;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "builtin-datasets-" + Guid.NewGuid().ToString("N"));
        _northstarQueries = Path.Combine(_root, "northstar-demo", "queries");
        _unitTestQueries = Path.Combine(_root, "unit-test", "queries");
        _northstarScripts = Path.Combine(_root, "northstar-demo", "scripts");
        Directory.CreateDirectory(_northstarQueries);
        Directory.CreateDirectory(_unitTestQueries);
        Directory.CreateDirectory(_northstarScripts);
        File.WriteAllText(Path.Combine(_northstarQueries, "b.json"), "{}");
        File.WriteAllText(Path.Combine(_northstarQueries, "A.json"), "{}");
        File.WriteAllText(Path.Combine(_northstarQueries, "notes.txt"), "");
        File.WriteAllText(Path.Combine(_unitTestQueries, "Test-1.json"), "{}");
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void EnumerateFilesFollowsFolderOrderAndSortsEachFolderByFileName()
    {
        var files = BuiltinDatasets.EnumerateFiles([_northstarQueries, _unitTestQueries], ".json")
            .Select(Path.GetFileName)
            .ToArray();

        Assert.That(files, Is.EqualTo(new[] { "A.json", "b.json", "Test-1.json" }));
    }

    [Test]
    public void EnumerateFilesSkipsMissingFolders()
    {
        var files = BuiltinDatasets.EnumerateFiles([Path.Combine(_root, "missing-dataset", "queries")], ".json");

        Assert.That(files, Is.Empty);
    }

    [Test]
    public void EnumerateScriptsMatchesProviderSuffixCaseInsensitively()
    {
        File.WriteAllText(Path.Combine(_northstarScripts, "northstar-demo.sqlite.sql"), "");
        File.WriteAllText(Path.Combine(_northstarScripts, "northstar-demo.postgres.sql"), "");

        var scripts = BuiltinDatasets.EnumerateScripts([_northstarScripts], "SQLite")
            .Select(Path.GetFileName)
            .ToArray();

        Assert.That(scripts, Is.EqualTo(new[] { "northstar-demo.sqlite.sql" }));
    }
}
