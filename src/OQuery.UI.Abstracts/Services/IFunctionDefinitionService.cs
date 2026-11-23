using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

/// <summary>User-defined SQL functions are shared by every project in the user section.</summary>
public interface IFunctionDefinitionService
{
    IReadOnlyList<FunctionDefinitionDto> GetAll();
    FunctionDefinitionDto Create(FunctionDefinitionDto dto);
    FunctionDefinitionDto Update(string functionName, FunctionDefinitionDto dto);
    void Delete(string functionName);
}
