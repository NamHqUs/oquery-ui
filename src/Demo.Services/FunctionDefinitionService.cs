using Demo.Contracts.Dto;
using Demo.Contracts.Application;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;
using OQuery;

namespace Demo.Services;

public sealed class FunctionDefinitionService(
    IFunctionDefinitionRepository repository,
    IUserSectionManager userSectionManager) : IFunctionDefinitionService
{
    public IReadOnlyList<FunctionDefinitionDto> GetAll()
    {
        var userDefined = repository.GetUserDefined(userSectionManager.GetSectionId());
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
        if (GetAllDefinitions(repository.GetUserDefined(sectionId)).Any(existing =>
            string.Equals(existing.Name, definition.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A function named '{definition.Name}' already exists.");

        repository.Save(sectionId, definition);
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
        if (!GetAllDefinitions(repository.GetUserDefined(sectionId)).Any(existing =>
            string.Equals(existing.Name, functionName, StringComparison.OrdinalIgnoreCase)))
            throw new KeyNotFoundException($"Function '{functionName}' was not found.");

        var definition = BuildDefinition(dto);
        var userDefinitions = repository.GetUserDefined(sectionId);
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

        repository.Save(sectionId, definition);
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
        if (!repository.GetUserDefined(sectionId).Any(item =>
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
        var builtin = repository.GetBuiltin();
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
        => repository.GetBuiltin().Any(definition =>
            string.Equals(definition.Name, functionName, StringComparison.OrdinalIgnoreCase));

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
        _ = new FunctionProvider(new SqlServerDialect(), [definition]);
        return definition;
    }
}
