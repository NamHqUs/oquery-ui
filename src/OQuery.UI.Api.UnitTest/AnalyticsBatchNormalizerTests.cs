using NUnit.Framework;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Application.Analytics;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class AnalyticsBatchNormalizerTests
{
    private static readonly Guid Visitor = Guid.NewGuid();
    private static readonly Guid Section = Guid.NewGuid();

    [Test]
    public void Normalize_RejectsEmptyIds()
    {
        Assert.That(AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Guid.Empty, Section, null, null, null, null, null, [])), Is.Null);
        Assert.That(AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Visitor, Guid.Empty, null, null, null, null, null, [])), Is.Null);
    }

    [Test]
    public void Normalize_RejectsMoreThanFiftyPageViews()
    {
        var views = Enumerable.Range(0, 51).Select(_ => new AnalyticsPageViewDto("/", 1)).ToList();

        Assert.That(AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Visitor, Section, null, null, null, null, null, views)), Is.Null);
    }

    [Test]
    public void Normalize_StripsQueryAndHash_AndDropsNonSitePaths()
    {
        var views = new List<AnalyticsPageViewDto>
        {
            new("/products/list?sort=asc#top", 1000),
            new("//evil.example/path", 1000),
            new("relative", 1000),
            new("/admin/analytics", 1000),
            new("/" + new string('a', 300), 1000),
        };

        var result = AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Visitor, Section, null, null, null, null, null, views));

        Assert.That(result!.PageViews!.Select(view => view.Page).ToList(), Is.EqualTo(new[] { "/products/list" }));
    }

    [Test]
    public void Normalize_ClampsDurationToZeroAndFourHours()
    {
        var views = new List<AnalyticsPageViewDto> { new("/a", -5), new("/b", int.MaxValue) };

        var result = AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Visitor, Section, null, null, null, null, null, views));

        Assert.That(result!.PageViews!.Select(view => view.DurationMs).ToList(),
            Is.EqualTo(new[] { 0, AnalyticsBatchNormalizer.MaxDurationMs }));
    }

    [Test]
    public void NormalizeReferrerHost_KeepsOnlyHttpHost()
    {
        Assert.Multiple(() =>
        {
            Assert.That(AnalyticsBatchNormalizer.NormalizeReferrerHost("https://News.Example.com/post?id=1"), Is.EqualTo("news.example.com"));
            Assert.That(AnalyticsBatchNormalizer.NormalizeReferrerHost("/relative/path"), Is.Null);
            Assert.That(AnalyticsBatchNormalizer.NormalizeReferrerHost("javascript:alert(1)"), Is.Null);
        });
    }

    [Test]
    public void Normalize_TrimsAndCapsUtmValues()
    {
        var utm = new string('c', 150);

        var result = AnalyticsBatchNormalizer.Normalize(new AnalyticsBatchDto(Visitor, Section, null, "  spring  ", null, utm, null, []));

        Assert.Multiple(() =>
        {
            Assert.That(result!.UtmSource, Is.EqualTo("spring"));
            Assert.That(result.UtmCampaign, Has.Length.EqualTo(AnalyticsBatchNormalizer.MaxFieldLength));
        });
    }
}

[TestFixture]
internal sealed class AdminTokenAttributeTests
{
    [Test]
    public void Matches_ComparesExactValue()
    {
        Assert.Multiple(() =>
        {
            Assert.That(AdminTokenAttribute.Matches("secret", "secret"), Is.True);
            Assert.That(AdminTokenAttribute.Matches("secret", "secreT"), Is.False);
            Assert.That(AdminTokenAttribute.Matches("secret", string.Empty), Is.False);
        });
    }
}
