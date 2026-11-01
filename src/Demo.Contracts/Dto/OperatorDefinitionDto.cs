using OQuery;

namespace Demo.Contracts.Dto;

public sealed class OperatorDefinitionDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Symbol { get; set; } = "";
    public string Description { get; set; } = "";
    public DataType LeftOperandType { get; set; }
    public DataType RightOperandType { get; set; }
    public List<DataType> SupportedDataTypes { get; set; } = [];
    public Dictionary<string, string> SqlTemplates { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }
}
