using OQuery;

namespace OQuery.UI.Abstracts.Repositories;

public interface IMetadataRepository : IRepository<Entity>
{
    void Reset(string userSectionId);
}
