using System.Text.Json;
using Demo.Contracts.Dto;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UI.UnitTest.Tests;

[TestFixture]
public sealed class QueryDtoValidationTests
{
    [TestCase("null", 0)]
    [TestCase("[]", 0)]
    [TestCase("""[{"field":"Id","direction":"ascending"}]""", 1)]
    public void ContextSortsAcceptNullOrFlatArrays(string sortsJson, int expectedCount)
    {
        var json = $$"""
            {
              "entity": "User",
              "name": "Nullable context sorts",
              "sorts": null,
              "contexts": {
                "First": { "entity": "User", "sorts": {{sortsJson}} },
                "Second": { "entity": "User", "sorts": null }
              }
            }
            """;
        var query = JsonSerializer.Deserialize<QueryDto>(
            json, JsonQueryDefinitionParser.CreateSerializerOptions())
            ?? throw new InvalidOperationException("The query did not deserialize.");

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers();
        using var provider = services.BuildServiceProvider();
        var actionContext = new ActionContext(
            new DefaultHttpContext { RequestServices = provider },
            new RouteData(), new ActionDescriptor(), new ModelStateDictionary());
        provider.GetRequiredService<IObjectModelValidator>()
            .Validate(actionContext, null, string.Empty, query);

        Assert.That(actionContext.ModelState.IsValid, Is.True,
            string.Join("; ", actionContext.ModelState.SelectMany(pair =>
                pair.Value!.Errors.Select(error => $"{pair.Key}: {error.ErrorMessage}"))));
        Assert.That(query.Sorts, Is.Null);
        Assert.That(query.Contexts!["First"].Sorts?.Count ?? 0, Is.EqualTo(expectedCount));
        Assert.That(query.Contexts["Second"].Sorts, Is.Null);
    }
}
