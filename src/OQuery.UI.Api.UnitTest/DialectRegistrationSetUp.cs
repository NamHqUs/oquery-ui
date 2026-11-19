using OQuery.UI.Application;
using NUnit.Framework;

namespace OQuery.UI.Api.UnitTest;

[SetUpFixture]
public sealed class DialectRegistrationSetUp
{
    [OneTimeSetUp]
    public void RegisterDialects() => DialectModules.RegisterAll();
}
