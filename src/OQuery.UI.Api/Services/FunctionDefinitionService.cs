using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery;
using OQuery.Database;
namespace OQuery.UI.Api.Services;

public sealed class FunctionDefinitionService(
    IFunctionDefinitionRepository repository,
    IUserSectionManager userSectionManager) : IFunctionDefinitionService
{
    public IReadOnlyList<FunctionDefinitionDto> GetAll()
    {
        var userDefined = UserDefined(userSectionManager.GetSectionId());
        var userDefinedNames = userDefined
            .Select(definition => definition.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return GetAllDefinitions(userDefined)
            .OrderBy(definition => definition.Name, StringComparer.OrdinalIgnoreCase)
            .Select(definition =>
            {
                var dto = FunctionDefinitionDto.FromFunctionDefinition(definition);
                dto.CanDelete = userDefinedNames.Contains(definition.Name);
                dto.IsBuiltin = !dto.CanDelete;
                return dto;
            })
            .ToArray();
    }

    public FunctionDefinitionDto Create(FunctionDefinitionDto dto)
    {
        var definition = BuildDefinition(dto);
        var sectionId = userSectionManager.GetSectionId();
        if (GetAllDefinitions(UserDefined(sectionId)).Any(existing =>
            string.Equals(existing.Name, definition.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A function named '{definition.Name}' already exists.");

        Store(sectionId, definition);
        var response = FunctionDefinitionDto.FromFunctionDefinition(definition);
        response.CanDelete = true;
        response.IsBuiltin = false;
        return response;
    }

    public FunctionDefinitionDto Update(string functionName, FunctionDefinitionDto dto)
    {
        ArgumentNullException.ThrowIfNull(dto);
        var sectionId = userSectionManager.GetSectionId();
        if (IsBuiltin(functionName))
            throw new InvalidOperationException($"Built-in function '{functionName}' is read-only.");
        if (!GetAllDefinitions(UserDefined(sectionId)).Any(existing =>
            string.Equals(existing.Name, functionName, StringComparison.OrdinalIgnoreCase)))
            throw new KeyNotFoundException($"Function '{functionName}' was not found.");

        var definition = BuildDefinition(dto);
        var userDefinitions = UserDefined(sectionId);
        var existing = userDefinitions.FirstOrDefault(item =>
            string.Equals(item.Name, functionName, StringComparison.OrdinalIgnoreCase));
        if (existing is null)
        {
            throw new KeyNotFoundException($"Function '{functionName}' was not found.");
        }
        if (GetAllDefinitions(userDefinitions).Any(item =>
            !string.Equals(item.Name, functionName, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(item.Name, definition.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A function named '{definition.Name}' already exists.");

        Store(sectionId, definition);
        if (!string.Equals(existing.Name, definition.Name, StringComparison.OrdinalIgnoreCase))
            repository.Delete(sectionId, existing.Name);
        var response = FunctionDefinitionDto.FromFunctionDefinition(definition);
        response.CanDelete = true;
        response.IsBuiltin = false;
        return response;
    }

    public void Delete(string functionName)
    {
        var sectionId = userSectionManager.GetSectionId();
        if (!UserDefined(sectionId).Any(item =>
            string.Equals(item.Name, functionName, StringComparison.OrdinalIgnoreCase)))
        {
            if (IsBuiltin(functionName))
                throw new InvalidOperationException($"Built-in function '{functionName}' cannot be deleted.");
            return;
        }

        repository.Delete(sectionId, functionName);
    }

    private IReadOnlyCollection<SqlFunctionDefintion> GetAllDefinitions(
        IReadOnlyCollection<SqlFunctionDefintion> userDefined)
    {
        var builtin = BuiltinDefinitions();
        var names = builtin.Select(definition => definition.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var definition in userDefined)
        {
            if (!names.Add(definition.Name))
                throw new InvalidDataException(
                    $"User function '{definition.Name}' cannot replace a built-in function.");
        }
        return builtin.Concat(userDefined).ToArray();
    }

    private bool IsBuiltin(string functionName)
        => BuiltinDefinitions().Any(definition =>
            string.Equals(definition.Name, functionName, StringComparison.OrdinalIgnoreCase));

    private IReadOnlyCollection<SqlFunctionDefintion> UserDefined(string sectionId)
        => repository.GetAll(sectionId)
            .Select(dto => dto.ToFunctionDefinition())
            .ToArray();

    private void Store(string sectionId, SqlFunctionDefintion definition)
        => repository.Save(sectionId, FunctionDefinitionDto.FromFunctionDefinition(definition));

    private static IReadOnlyCollection<SqlFunctionDefintion> BuiltinDefinitions()
        => SqlDialectRegistry.CreateAllDialects()
            .SelectMany(dialect => new FunctionProvider(dialect).GetFunctions())
            .GroupBy(function => function.Name, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var first = group.First();
                return new SqlFunctionDefintion(
                    first.Name,
                    first.Arguments,
                    first.ResultType,
                    first.Description,
                    group.SelectMany(function => function.SqlTemplates)
                        .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase),
                    first.BindArgumentsFromEnd,
                    first.FunctionApplyFor);
            })
            .ToArray();

    private static SqlFunctionDefintion BuildDefinition(FunctionDefinitionDto dto)
    {
        ArgumentNullException.ThrowIfNull(dto);
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Function name is required.");
        if (dto.Arguments is null)
            throw new ArgumentException("Function arguments are required.");
        if (dto.SqlTemplates is null)
            throw new ArgumentException("SQL templates are required.");
        if (dto.Arguments.Any(argument => argument is null))
            throw new ArgumentException("Function arguments cannot contain null definitions.");

        var definition = dto.ToFunctionDefinition();
        _ = new FunctionProvider(SqlDialectRegistry.CreateForProvider("SqlServer"), [definition]);
        return definition;
    }
}
