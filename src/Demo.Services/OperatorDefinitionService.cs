using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;

namespace Demo.Services;

public sealed class OperatorDefinitionService(
    IOperatorDefinitionRepository repository,
    IUserSectionManager userSectionManager) : IOperatorDefinitionService
{
    private static readonly OperatorDefinitionDto[] BuiltinDefinitions = CreateBuiltins();

    public IReadOnlyList<OperatorDefinitionDto> GetAll()
    {
        var userDefinitions = repository.GetUserDefined(userSectionManager.GetSectionId());
        var builtinIds = System.Linq.Enumerable.Select(BuiltinDefinitions, definition => definition.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (System.Linq.Enumerable.Any(userDefinitions, definition => builtinIds.Contains(definition.Id)))
            throw new InvalidDataException("A user operator cannot replace a built-in operator.");

        return System.Linq.Enumerable.Select(BuiltinDefinitions, definition => Clone(definition))
            .Concat(System.Linq.Enumerable.Select(userDefinitions, definition => Clone(definition)))
            .OrderBy(definition => definition.IsBuiltin ? 0 : 1)
            .ThenBy(definition => definition.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public OperatorDefinitionDto Create(OperatorDefinitionDto dto)
    {
        var definition = ValidateAndNormalize(dto);
        var sectionId = userSectionManager.GetSectionId();
        if (GetAll().Any(existing =>
            string.Equals(existing.Name, definition.Name, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(existing.Symbol, definition.Symbol, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"An operator named or symbolized '{definition.Name}' already exists.");

        repository.Save(sectionId, definition);
        return Clone(definition, canDelete: true);
    }

    public OperatorDefinitionDto Update(string operatorId, OperatorDefinitionDto dto)
    {
        var sectionId = userSectionManager.GetSectionId();
        if (BuiltinDefinitions.Any(definition =>
            string.Equals(definition.Id, operatorId, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in operator '{operatorId}' is read-only.");

        var existing = repository.Get(sectionId, operatorId)
            ?? throw new KeyNotFoundException($"Operator '{operatorId}' was not found.");
        var definition = ValidateAndNormalize(dto);
        definition.Id = existing.Id;
        if (GetAll().Any(item =>
            !string.Equals(item.Id, operatorId, StringComparison.OrdinalIgnoreCase) &&
            (string.Equals(item.Name, definition.Name, StringComparison.OrdinalIgnoreCase) ||
             string.Equals(item.Symbol, definition.Symbol, StringComparison.OrdinalIgnoreCase))))
            throw new InvalidOperationException($"An operator named or symbolized '{definition.Name}' already exists.");

        repository.Save(sectionId, definition);
        return Clone(definition, canDelete: true);
    }

    public void Delete(string operatorId)
    {
        if (BuiltinDefinitions.Any(definition =>
            string.Equals(definition.Id, operatorId, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in operator '{operatorId}' cannot be deleted.");
        repository.Delete(userSectionManager.GetSectionId(), operatorId);
    }

    private static OperatorDefinitionDto ValidateAndNormalize(OperatorDefinitionDto dto)
    {
        ArgumentNullException.ThrowIfNull(dto);
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Operator name is required.");
        if (string.IsNullOrWhiteSpace(dto.Symbol))
            throw new ArgumentException("Operator symbol is required.");
        if (!Enum.IsDefined(dto.LeftOperandType) || !Enum.IsDefined(dto.RightOperandType))
            throw new ArgumentException("Operator operand types must be valid data types.");
        if (dto.SqlTemplates is null)
            throw new ArgumentException("SQL templates are required.");

        var templates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var provider in new[] { "Sqlite", "SqlServer", "Postgres", "Cockroach", "Firebird", "Maria", "Oracle", "SapHana", "Db2" })
        {
            if (!dto.SqlTemplates.TryGetValue(provider, out var template) ||
                !IsValidTemplate(template))
                throw new ArgumentException(
                    $"A {provider} template containing exactly one {{left}} and one {{value}} placeholder is required.");
            templates.Add(provider, template.Trim());
        }

        var name = dto.Name.Trim();
        var id = string.IsNullOrWhiteSpace(dto.Id)
            ? $"custom:{Guid.NewGuid():N}"
            : dto.Id;
        if (!id.StartsWith("custom:", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Custom operator IDs must use the 'custom:' prefix.");

        return new OperatorDefinitionDto
        {
            Id = id,
            Name = name,
            Symbol = dto.Symbol.Trim(),
            Description = dto.Description?.Trim() ?? "",
            LeftOperandType = dto.LeftOperandType,
            RightOperandType = dto.RightOperandType,
            SupportedDataTypes = [dto.LeftOperandType],
            SqlTemplates = templates,
            CanDelete = true,
            IsBuiltin = false
        };
    }

    private static bool IsValidTemplate(string? template)
    {
        if (string.IsNullOrWhiteSpace(template))
            return false;
        var leftCount = Count(template, "{left}");
        var valueCount = Count(template, "{value}");
        var withoutPlaceholders = template.Replace("{left}", "", StringComparison.Ordinal)
            .Replace("{value}", "", StringComparison.Ordinal);
        return leftCount == 1 && valueCount == 1 &&
            !withoutPlaceholders.Contains('{') && !withoutPlaceholders.Contains('}');
    }

    private static int Count(string text, string value)
        => (text.Length - text.Replace(value, "", StringComparison.Ordinal).Length) / value.Length;

    private static OperatorDefinitionDto Clone(OperatorDefinitionDto definition, bool? canDelete = null)
        => new()
        {
            Id = definition.Id,
            Name = definition.Name,
            Symbol = definition.Symbol,
            Description = definition.Description,
            LeftOperandType = definition.LeftOperandType,
            RightOperandType = definition.RightOperandType,
            SupportedDataTypes = [.. definition.SupportedDataTypes],
            SqlTemplates = new Dictionary<string, string>(definition.SqlTemplates, StringComparer.OrdinalIgnoreCase),
            CanDelete = canDelete ?? definition.CanDelete,
            IsBuiltin = definition.IsBuiltin
        };

    private static OperatorDefinitionDto[] CreateBuiltins()
    {
        var allDataTypes = new[] { DataType.String, DataType.Number, DataType.Datetime, DataType.Boolean };
        var comparableDataTypes = new[] { DataType.Number, DataType.Datetime };
        var definitions = new[]
        {
            Builtin(BinaryOperator.Equals, "Equals", "=", "Equal to", allDataTypes),
            Builtin(BinaryOperator.NotEquals, "Not equals", "<>", "Not equal to", allDataTypes),
            Builtin(BinaryOperator.Like, "Like", "LIKE", "Matches a SQL LIKE pattern", [DataType.String]),
            Builtin(BinaryOperator.NotLike, "Not like", "NOT LIKE", "Does not match a SQL LIKE pattern", [DataType.String]),
            Builtin(BinaryOperator.GreaterThan, "Greater than", ">", "Greater than", comparableDataTypes),
            Builtin(BinaryOperator.LessThan, "Less than", "<", "Less than", comparableDataTypes),
            Builtin(BinaryOperator.GreaterThanOrEqual, "Greater than or equal", ">=", "Greater than or equal to", comparableDataTypes),
            Builtin(BinaryOperator.LessThanOrEqual, "Less than or equal", "<=", "Less than or equal to", comparableDataTypes),
            Builtin(BinaryOperator.Between, "Between", "BETWEEN", "Within an inclusive range", comparableDataTypes),
            Builtin(BinaryOperator.NotBetween, "Not between", "NOT BETWEEN", "Outside an inclusive range", comparableDataTypes),
            Builtin(BinaryOperator.In, "In", "IN", "Matches one of a set of values", allDataTypes),
            Builtin(BinaryOperator.NotIn, "Not in", "NOT IN", "Does not match any of a set of values", allDataTypes),
            Builtin(BinaryOperator.IsNull, "Is null", "IS NULL", "Is null", allDataTypes),
            Builtin(BinaryOperator.IsNotNull, "Is not null", "IS NOT NULL", "Is not null", allDataTypes)
        };
        return definitions;
    }

    private static OperatorDefinitionDto Builtin(
        BinaryOperator operation,
        string name,
        string symbol,
        string description,
        DataType[] dataTypes)
    {
        var sqlTemplate = operation switch
        {
            BinaryOperator.IsNull or BinaryOperator.IsNotNull => "{left} " + symbol,
            BinaryOperator.In or BinaryOperator.NotIn => $"{{left}} {symbol} ({{value}})",
            _ => $"{{left}} {symbol} {{value}}"
        };
        return new OperatorDefinitionDto
        {
            Id = $"builtin:{(int)operation}",
            Name = name,
            Symbol = symbol,
            Description = description,
            LeftOperandType = dataTypes[0],
            RightOperandType = dataTypes[0],
            SupportedDataTypes = dataTypes.ToList(),
            SqlTemplates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["Sqlite"] = sqlTemplate,
                ["SqlServer"] = sqlTemplate,
                ["Postgres"] = sqlTemplate,
                ["Cockroach"] = sqlTemplate,
                ["Firebird"] = sqlTemplate,
                ["Maria"] = sqlTemplate,
                ["Oracle"] = sqlTemplate,
                ["SapHana"] = sqlTemplate,
                ["Db2"] = sqlTemplate
            },
            CanDelete = false,
            IsBuiltin = true
        };
    }
}
