using Demo.Contracts.Dto;

namespace Demo.Contracts.Services;

public interface IBusinessScopeService
{
    IReadOnlyList<BusinessScopeDto> GetAll();
    BusinessScopeDto Create(BusinessScopeDto scope);
    BusinessScopeDto Generate(BusinessScopeGenerationRequestDto request);
    BusinessScopeDto Update(string scopeName, BusinessScopeDto scope);
    void Delete(string scopeName);
}
