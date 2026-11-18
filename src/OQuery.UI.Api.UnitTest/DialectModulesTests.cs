using OQuery.UI.Application;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

public static class FakeDiscoveryDialectModule
{
    public static ISqlDialect CreateDialect() => null!;
}

public static class NotDetectedWithoutSuffix
{
    public static ISqlDialect CreateDialect() => null!;
}

public static class FakeDiscoveryDialectModuleWithArgument
{
    public static ISqlDialect CreateDialect(string name) => null!;
}

[TestFixture]
public sealed class DialectModulesTests
{
    [Test]
    public void GetModuleTypes_FindsStaticDialectModuleWithParameterlessCreateDialect()
    {
        var types = DialectModules.GetModuleTypes(typeof(DialectModulesTests).Assembly).ToArray();

        Assert.That(types, Does.Contain(typeof(FakeDiscoveryDialectModule)));
        Assert.That(types, Does.Not.Contain(typeof(NotDetectedWithoutSuffix)));
        Assert.That(types, Does.Not.Contain(typeof(FakeDiscoveryDialectModuleWithArgument)));
    }

    [Test]
    public void RegisterFromFolder_MissingFolder_ReturnsEmpty()
    {
        var missing = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));

        Assert.That(DialectModules.RegisterFromFolder(missing), Is.Empty);
    }
}
