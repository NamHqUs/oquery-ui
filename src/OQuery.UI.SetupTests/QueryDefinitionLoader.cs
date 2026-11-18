using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UnitTest.Setup;

public static class QueryDefinitionLoader
{
    public static QueryDefinition Load(string path)
        => QueryDefinitionJsonParser.Parse(File.ReadAllText(path));
}
