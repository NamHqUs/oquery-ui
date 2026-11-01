//using Demo.Contracts.Repositories;
//using Demo.Share;
//using OQuery;

//namespace Demo.Repositories.InMemory;

//public sealed class FunctionDefinitionMemoryRepository : IFunctionDefinitionRepository
//{
//    private readonly Dictionary<string, SqlFunctionDefintion> _definitions =
//        CustomFunctionDefintions.Functions.ToDictionary(
//            definition => definition.Name,
//            StringComparer.OrdinalIgnoreCase);

//    public IReadOnlyList<SqlFunctionDefintion> GetBuiltInDefinitions()
//        => new FunctionProvider(new SqlServerDialect()).GetFunctions().ToArray();

//    public IReadOnlyList<SqlFunctionDefintion> GetCustomDefinitions()
//        => _definitions.Values.ToArray();

//    public void Save(SqlFunctionDefintion definition)
//        => _definitions[definition.Name] = definition;

//    public void Delete(string functionName) => _definitions.Remove(functionName);
//}
