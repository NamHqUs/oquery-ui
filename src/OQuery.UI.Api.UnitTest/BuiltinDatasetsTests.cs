using OQuery.UI.Abstracts;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class BuiltinDatasetsTests
{
    private string _root = string.Empty;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "builtin-datasets-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(_root, "northstar-demo", "queries"));
        Directory.CreateDirectory(Path.Combine(_root, "unit-test", "queries"));
        File.WriteAllText(Path.Combine(_root, "northstar-demo", "queries", "b.json"), "{}");
        File.WriteAllText(Path.Combine(_root, "northstar-demo", "queries", "A.json"), "{}");
        File.WriteAllText(Path.Combine(_root, "northstar-demo", "queries", "notes.txt"), "");
        File.WriteAllText(Path.Combine(_root, "unit-test", "queries", "Test-1.json"), "{}");
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void EnumerateFilesFollowsDataSetOrderAndSortsEachDatasetByFileName()
    {
        var files = BuiltinDatasets.EnumerateFiles(_root, ["northstar-demo", "unit-test"], BuiltinDatasets.QueriesFolder, ".json")
            .Select(Path.GetFileName)
            .ToArray();

        Assert.That(files, Is.EqualTo(new[] { "A.json", "b.json", "Test-1.json" }));
    }

    [Test]
    public void EnumerateFilesSkipsDataSetsWithoutTheRequestedFolder()
    {
        var files = BuiltinDatasets.EnumerateFiles(_root, ["missing-dataset"], BuiltinDatasets.QueriesFolder, ".json");

        Assert.That(files, Is.Empty);
    }

    [Test]
    public void GetScriptPathLowercasesTheDatasetAndProviderName()
    {
        var path = BuiltinDatasets.GetScriptPath(_root, "Northstar-Demo", "SQLite");

        Assert.That(path, Is.EqualTo(Path.Combine(_root, "Northstar-Demo", "scripts", "northstar-demo.sqlite.sql")));
    }
}
