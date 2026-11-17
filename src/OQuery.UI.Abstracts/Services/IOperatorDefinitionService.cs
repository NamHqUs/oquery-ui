using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IOperatorDefinitionService
{
    IReadOnlyList<OperatorDefinitionDto> GetAll();
    OperatorDefinitionDto Create(OperatorDefinitionDto dto);
    OperatorDefinitionDto Update(string operatorId, OperatorDefinitionDto dto);
    void Delete(string operatorId);
}
