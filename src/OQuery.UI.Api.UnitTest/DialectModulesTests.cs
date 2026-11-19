using OQuery.Database;
using OQuery.UI.Application;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
public sealed class DialectModulesTests
{
    [Test]
    public void RegisterAll_RegistersEveryShippedProviderAndAlias()
    {
        DialectModules.RegisterAll();

        Assert.That(SqlDialectRegistry.RegisteredNames, Does.Contain("Sqlite").And.Contain("SqlServer").And.Contain("MySql"));
        Assert.That(SqlDialectRegistry.CreateForProvider("mariadb"), Is.Not.Null);
        Assert.That(SqlDialectRegistry.CreateForProvider("postgresql"), Is.Not.Null);
    }
}

