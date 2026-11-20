using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Storage.Files;

/// <summary>
/// Stores each project in <c>projects/{projectId}</c>: <c>project.json</c>, <c>domains/fulldomain.json</c>
/// and one <c>domains/{domainId}.json</c> per sub-domain.
/// </summary>
public sealed class ProjectFileRepository(FilePathResolver filePathResolver) : IProjectRepository
{
    private const string PROJECT_FILE = "project.json";
    private const string DOMAINS_FOLDER = "domains";
    private const string FULL_DOMAIN_NAME = "fulldomain";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };

    public IReadOnlyList<ProjectFileDto> GetAll(string userSectionId)
    {
        var root = filePathResolver.GetProjectsFolder(userSectionId);
        if (!Directory.Exists(root))
            return [];

        return Directory.EnumerateDirectories(root)
            .Select(dir => Path.Combine(dir, PROJECT_FILE))
            .Where(File.Exists)
            .Select(ReadProject)
            .OrderBy(project => project.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public ProjectFileDto? Get(string userSectionId, string projectId)
    {
        var path = Path.Combine(ProjectFolder(userSectionId, projectId), PROJECT_FILE);
        return File.Exists(path) ? ReadProject(path) : null;
    }

    public string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = RandomNumberGenerator.GetString(ID_CHARACTERS, 8);
        }
        while (Directory.Exists(ProjectFolder(userSectionId, id)));

        return id;
    }

    public void Save(string userSectionId, ProjectFileDto project)
    {
        ArgumentNullException.ThrowIfNull(project);
        if (string.IsNullOrWhiteSpace(project.Name))
            throw new ArgumentException("Project name is required.", nameof(project));
        if (GetAll(userSectionId).Any(existing =>
            !existing.Id.Equals(project.Id, StringComparison.OrdinalIgnoreCase)
            && existing.Name.Equals(project.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A project named '{project.Name}' already exists.");

        var folder = ProjectFolder(userSectionId, project.Id);
        Directory.CreateDirectory(folder);
        WriteJson(Path.Combine(folder, PROJECT_FILE), project);
    }

    public bool Delete(string userSectionId, string projectId)
    {
        var folder = ProjectFolder(userSectionId, projectId);
        if (!Directory.Exists(folder))
            return false;

        Directory.Delete(folder, recursive: true);
        return true;
    }

    public FullDomainDto? GetFullDomain(string userSectionId, string projectId)
        => ReadOptional<FullDomainDto>(FullDomainPath(userSectionId, projectId));

    public void SaveFullDomain(string userSectionId, string projectId, FullDomainDto fullDomain)
    {
        ArgumentNullException.ThrowIfNull(fullDomain);
        var path = FullDomainPath(userSectionId, projectId);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        WriteJson(path, fullDomain);
    }

    public IReadOnlyList<DomainDto> GetDomains(string userSectionId, string projectId)
    {
        var folder = DomainsFolder(userSectionId, projectId);
        if (!Directory.Exists(folder))
            return [];

        return Directory.EnumerateFiles(folder, "*.json")
            .Where(path => !Path.GetFileNameWithoutExtension(path).Equals(FULL_DOMAIN_NAME, StringComparison.OrdinalIgnoreCase))
            .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
            .Select(ReadDomain)
            .ToArray();
    }

    public DomainDto? GetDomain(string userSectionId, string projectId, string domainId)
    {
        var path = DomainPath(userSectionId, projectId, domainId);
        return File.Exists(path) ? ReadDomain(path) : null;
    }

    public void SaveDomain(string userSectionId, string projectId, DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(domain);
        var path = DomainPath(userSectionId, projectId, domain.Id);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        WriteJson(path, domain);
    }

    public bool DeleteDomain(string userSectionId, string projectId, string domainId)
    {
        var path = DomainPath(userSectionId, projectId, domainId);
        if (!File.Exists(path))
            return false;

        File.Delete(path);
        return true;
    }

    private string ProjectFolder(string userSectionId, string projectId)
        => Path.Combine(filePathResolver.GetProjectsFolder(userSectionId), ValidFileName(projectId, "Project ID"));

    private string DomainsFolder(string userSectionId, string projectId)
        => Path.Combine(ProjectFolder(userSectionId, projectId), DOMAINS_FOLDER);

    private string FullDomainPath(string userSectionId, string projectId)
        => Path.Combine(DomainsFolder(userSectionId, projectId), $"{FULL_DOMAIN_NAME}.json");

    private string DomainPath(string userSectionId, string projectId, string domainId)
    {
        var name = ValidFileName(domainId, "Domain ID");
        if (name.Equals(FULL_DOMAIN_NAME, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Domain ID is reserved.", nameof(domainId));
        return Path.Combine(DomainsFolder(userSectionId, projectId), $"{name}.json");
    }

    private static string ValidFileName(string value, string label)
    {
        if (string.IsNullOrWhiteSpace(value) || Path.GetFileName(value) != value)
            throw new ArgumentException($"{label} is not a valid folder or file name.", nameof(value));
        return value;
    }

    private static ProjectFileDto ReadProject(string path)
        => ReadOptional<ProjectFileDto>(path)
            ?? throw new InvalidDataException($"Project file '{path}' is missing.");

    private static DomainDto ReadDomain(string path)
    {
        var domain = ReadOptional<DomainDto>(path)
            ?? throw new InvalidDataException($"Domain file '{path}' is missing.");
        if (string.IsNullOrWhiteSpace(domain.Id))
            domain.Id = Path.GetFileNameWithoutExtension(path);
        return domain;
    }

    private static T? ReadOptional<T>(string path) where T : class
    {
        if (!File.Exists(path))
            return null;
        return JsonSerializer.Deserialize<T>(File.ReadAllText(path))
            ?? throw new InvalidDataException($"Failed to deserialize '{path}'.");
    }

    private static void WriteJson<T>(string path, T value)
        => File.WriteAllText(path, JsonSerializer.Serialize(value, WriteOptions));
}
