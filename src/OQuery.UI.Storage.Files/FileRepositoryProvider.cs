using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;

namespace OQuery.UI.Storage.Files;

/// <summary>
/// File-based provider. Built-in domains and queries are kept in memory for the process lifetime;
/// user-defined items are stored as JSON under the configured user data folder.
/// </summary>
public sealed class FileRepositoryProvider : IRepositoryProvider
{
    public FileRepositoryProvider(
        FilePathResolver filePathResolver,
        IReadOnlyCollection<DomainDto> builtinDomains,
        IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        ArgumentNullException.ThrowIfNull(filePathResolver);
        Domains = new DomainFileRepository(filePathResolver, builtinDomains);
        Queries = new QueryRequestFileRepository(filePathResolver, builtinQueries);
        Functions = new FunctionDefinitionFileRepository(filePathResolver);
    }

    public IDomainRepository Domains { get; }
    public IQueryRequestRepository Queries { get; }
    public IFunctionDefinitionRepository Functions { get; }
}
