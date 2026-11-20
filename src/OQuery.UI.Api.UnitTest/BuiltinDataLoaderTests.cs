using NUnit.Framework;
using OQuery.UI.Services;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class BuiltinDataLoaderTests
{
    private static readonly string[] DataSets = ["northstar-demo", "unit-test"];

    private string _root = string.Empty;

    [SetUp]
    public void SetUp()
    {
        _root = Path.Combine(Path.GetTempPath(), "builtin-data-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_root);
    }

    [TearDown]
    public void TearDown()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Test]
    public void LoadReadsQueriesFromEveryDataSetAndMarksThemBuiltin()
    {
        WriteFile("northstar-demo", "queries", "q0.json", """{ "id": "q0", "name": "Q0" }""");
        WriteFile("unit-test", "queries", "q1.json", """{ "id": "q1", "name": "Q1" }""");

        var data = BuiltinDataLoader.Load(_root, DataSets);

        Assert.That(data.Queries.Select(query => query.Id), Is.EqualTo(new[] { "q0", "q1" }));
        Assert.That(data.Queries.All(query => query.IsBuiltin), Is.True);
    }

    [Test]
    public void LoadIgnoresDataSetsThatAreNotChosen()
    {
        WriteFile("northstar-demo", "queries", "q0.json", """{ "id": "q0", "name": "Q0" }""");
        WriteFile("unit-test", "queries", "q1.json", """{ "id": "q1", "name": "Q1" }""");

        var data = BuiltinDataLoader.Load(_root, ["northstar-demo"]);

        Assert.That(data.Queries.Select(query => query.Id), Is.EqualTo(new[] { "q0" }));
    }

    [Test]
    public void LoadReturnsEmptyCollectionsWhenDataSetFoldersAreMissing()
    {
        var data = BuiltinDataLoader.Load(_root, DataSets);

        Assert.That(data.Queries, Is.Empty);
    }

    [Test]
    public void GetScriptsMatchesProviderSuffixCaseInsensitively()
    {
        WriteFile("northstar-demo", "scripts", "northstar-demo.sqlite.sql", "");
        WriteFile("northstar-demo", "scripts", "northstar-demo.postgres.sql", "");

        var scripts = BuiltinDataLoader.GetScripts(_root, DataSets, "SQLite")
            .Select(Path.GetFileName)
            .ToArray();

        Assert.That(scripts, Is.EqualTo(new[] { "northstar-demo.sqlite.sql" }));
    }

    [Test]
    public void LoadThrowsWhenBasePathIsMissing()
    {
        Assert.That(() => BuiltinDataLoader.Load(null, DataSets), Throws.InvalidOperationException);
    }

    private void WriteFile(string dataSet, string folder, string fileName, string content)
    {
        var directory = Path.Combine(_root, dataSet, folder);
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, fileName), content);
    }
}
