using OQuery.UI.Application;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

public static class FakeDiscoveryDialectModule
{
    public static void Register() { }
}

public static class NotDetectedWithoutSuffix
{
    public static void Register() { }
}

public static class FakeDiscoveryDialectModuleWithArgument
{
    public static void Register(string name) { }
}

[TestFixture]
public sealed class DialectModulesTests
{
    [Test]
    public void GetModuleTypes_FindsStaticDialectModuleWithParameterlessRegister()
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
