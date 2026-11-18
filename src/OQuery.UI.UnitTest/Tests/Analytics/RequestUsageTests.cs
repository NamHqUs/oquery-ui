using Microsoft.AspNetCore.Http;
using OQuery.UI.Application.Analytics;
using OQuery.UI.Application.Middlewares;

namespace OQuery.UnitTest.Tests.Analytics;

[TestFixture]
public class RequestUsageTests
{
    private static readonly DateOnly Day = new(2025, 1, 1);

    [Test]
    public void Collector_AddsToSameKey_AndDrainClears()
    {
        var collector = new RequestUsageCollector();
        var section = Guid.CreateVersion7();

        collector.Add(Day, section, "/query-request/{id}");
        collector.Add(Day, section, "/query-request/{id}", count: 2);

        var rows = collector.Drain();
        Assert.That(rows, Has.Count.EqualTo(1));
        Assert.That(rows[0].Count, Is.EqualTo(3));
        Assert.That(collector.Drain(), Is.Empty);
    }

    [Test]
    public void Collector_SplitsSameUrl_ByClientPage()
    {
        var collector = new RequestUsageCollector();
        var section = Guid.CreateVersion7();

        collector.Add(Day, section, "/query-request/{id}", "/domains");
        collector.Add(Day, section, "/query-request/{id}", "/query-builder");

        var rows = collector.Drain();
        Assert.That(rows, Has.Count.EqualTo(2));
        Assert.That(rows.Select(row => row.Page), Is.EquivalentTo(new[] { "/domains", "/query-builder" }));
    }

    [Test]
    public void Collector_DropsNewKeys_OnceCapIsReached_ButKeepsCountingExistingKeys()
    {
        var collector = new RequestUsageCollector();
        var section = Guid.CreateVersion7();

        for (var i = 0; i < RequestUsageCollector.MaxEntries; i++)
            collector.Add(Day, section, $"/route/{i}");

        collector.Add(Day, section, "/route/overflow");
        collector.Add(Day, section, "/route/0");

        var rows = collector.Drain();
        Assert.That(rows, Has.Count.EqualTo(RequestUsageCollector.MaxEntries));
        Assert.That(rows.Any(row => row.Url == "/route/overflow"), Is.False);
        Assert.That(rows.Single(row => row.Url == "/route/0").Count, Is.EqualTo(2));
    }

    [Test]
    public void UserSection_IssuesCookie_WhenMissing()
    {
        var context = new DefaultHttpContext();

        var sectionId = CreateManager(context).GetSectionId();

        Assert.That(Guid.TryParse(sectionId, out _), Is.True);
        var setCookie = context.Response.Headers["Set-Cookie"].ToString();
        Assert.That(setCookie, Does.StartWith($"{UserSectionManager.CookieName}={sectionId}"));
        Assert.That(setCookie, Does.Contain("httponly"));
        Assert.That(setCookie, Does.Contain("samesite=lax"));
    }

    [Test]
    public void UserSection_ReusesValidCookie_WithoutReissuing()
    {
        var existing = Guid.CreateVersion7().ToString("D");
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = $"{UserSectionManager.CookieName}={existing}";

        var sectionId = CreateManager(context).GetSectionId();

        Assert.That(sectionId, Is.EqualTo(existing));
        Assert.That(context.Response.Headers.ContainsKey("Set-Cookie"), Is.False);
    }

    [Test]
    public void UserSection_ReplacesInvalidCookie()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = $"{UserSectionManager.CookieName}=not-a-guid";

        var sectionId = CreateManager(context).GetSectionId();

        Assert.That(Guid.TryParse(sectionId, out _), Is.True);
        Assert.That(context.Response.Headers["Set-Cookie"].ToString(), Does.StartWith($"{UserSectionManager.CookieName}={sectionId}"));
    }

    private static UserSectionManager CreateManager(HttpContext context)
    {
        var accessor = new HttpContextAccessor { HttpContext = context };
        return new UserSectionManager(accessor);
    }
}
