using Demo.DbServices;
using Microsoft.Extensions.Configuration;

namespace OQuery.UI.UnitTest.Tests;

[TestFixture]
public sealed class DbConnectionServiceTests
{
    [Test]
    public void GetConnectionOptionsReturnsConfiguredConnectionProfiles()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["DbProvider:AllowDirectConnections"] = "false",
                ["ConnectionOptions:0:Name"] = "Sqlite",
                ["ConnectionOptions:0:Provider"] = "Sqlite",
                ["ConnectionOptions:0:ConnectionString"] = "Data Source=:memory:",
                ["ConnectionOptions:1:Name"] = "Postgres",
                ["ConnectionOptions:1:Provider"] = "Postgres",
                ["ConnectionOptions:1:ConnectionString"] = "Host=localhost",
            })
            .Build();
        var service = new DbConnectionService(configuration, new DatabaseService(configuration));

        var options = ((Demo.Contracts.Services.IDbConnectionService)service).GetConnectionOptions();

        Assert.That(options.Profiles, Is.EqualTo(new[] { "Sqlite", "Postgres" }));
        Assert.That(options.DirectConnectionsEnabled, Is.False);
    }
}
