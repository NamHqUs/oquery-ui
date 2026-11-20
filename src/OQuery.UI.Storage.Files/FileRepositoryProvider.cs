using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;

namespace OQuery.UI.Storage.Files;

/// <summary>
/// File-based provider. Built-in queries are kept in memory for the process lifetime;
/// user-defined projects, queries and functions are stored as JSON under the configured user data folder.
/// </summary>
public sealed class FileRepositoryProvider
{
    public FileRepositoryProvider(
        FilePathResolver filePathResolver,
        IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        ArgumentNullException.ThrowIfNull(filePathResolver);
        Projects = new ProjectFileRepository(filePathResolver);
        Queries = new QueryRequestFileRepository(filePathResolver, builtinQueries);
        Functions = new FunctionDefinitionFileRepository(filePathResolver);
    }

    public IProjectRepository Projects { get; }
    public IQueryRequestRepository Queries { get; }
    public IFunctionDefinitionRepository Functions { get; }
}
