using Demo.Contracts.Dto;
using OQuery;

namespace Demo.Contracts.Services;

public interface IBusinessScopeService
{
    IReadOnlyList<BusinessScopeDto> GetAll();
    IReadOnlyList<MetadataEntityDto> GetEntities(string? scopeName);
    BusinessScopeDto Create(BusinessScopeDto scope);
    BusinessScopeDto Generate(BusinessScopeGenerationRequestDto request);
    BusinessScopeDto Update(string scopeName, BusinessScopeDto scope);
    void Delete(string scopeName);
    IMetadataProvider GetMetadataProvider(string? scopeName);
}
