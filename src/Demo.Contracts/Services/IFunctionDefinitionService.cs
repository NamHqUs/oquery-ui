using Demo.Contracts.Dto;

namespace Demo.Contracts.Services;

public interface IFunctionDefinitionService
{
    IReadOnlyList<FunctionDefinitionDto> GetAll();
    FunctionDefinitionDto Create(FunctionDefinitionDto dto);
    FunctionDefinitionDto Update(string functionName, FunctionDefinitionDto dto);
    void Delete(string functionName);
}
