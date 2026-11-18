using OQuery.QueryDefinitions.Parsers;
using OQuery.UnitTest;

namespace OQuery.UnitTest.Tests.Query.Definitions;

[TestFixture]
internal sealed class QueryDefinitionDatabaseTests : TestBase
{

    [Test]
    public void OperatorFieldsRespectArithmeticPrecedence()
    {
        var query = new QueryDefinition("User")
        {

            Projections =
            [
                new ProjectionDefinition(
                    new GroupFieldDefintion(
                        QueryDefinitionJsonParser.ParseExpression("<1> + <2> * <3> - <3>")),
                    "Calculated")
            ]
        };

        var result = _db.Query(query).ToList();

        Assert.That(result[0]["Calculated"], Is.EqualTo(4m));
    }
}
