using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

public interface IQueryRequestRepository : IRepository<QueryDto>
{
    string CreateId(string userSectionId);
}
