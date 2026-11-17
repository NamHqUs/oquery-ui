using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IFunctionDefinitionService
{
    IReadOnlyList<FunctionDefinitionDto> GetAll();
    FunctionDefinitionDto Create(FunctionDefinitionDto dto);
    FunctionDefinitionDto Update(string functionName, FunctionDefinitionDto dto);
    void Delete(string functionName);
}
