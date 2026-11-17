using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

public interface IDomainRepository : IRepository<DomainDto>
{
    string CreateId(string userSectionId);
}
