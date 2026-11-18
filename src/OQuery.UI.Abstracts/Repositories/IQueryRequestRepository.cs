using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

public interface IQueryRequestRepository : IRepository<QueryRequestRecordDto>
{
    string CreateId(string userSectionId);
}
