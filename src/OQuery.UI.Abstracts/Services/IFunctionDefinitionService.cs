using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IFunctionDefinitionService
{
    IReadOnlyList<FunctionDefinitionDto> GetAll(string projectId);
    FunctionDefinitionDto Create(string projectId, FunctionDefinitionDto dto);
    FunctionDefinitionDto Update(string projectId, string functionName, FunctionDefinitionDto dto);
    void Delete(string projectId, string functionName);
}
