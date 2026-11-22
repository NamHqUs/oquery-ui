using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Storage.Files;

/// <summary>
/// Stores each project in <c>projects/{projectId}</c>: <c>project.json</c> and one <c>domains/{domainId}.json</c>
/// per domain. The Main domain file also holds the project's FullDomain. Legacy <c>domains/fulldomain.json</c>
/// files are merged into <c>main.json</c> the first time the project's domains or FullDomain are read.
/// </summary>
public sealed class ProjectFileRepository(FilePathResolver filePathResolver) : IProjectRepository
{
    private const string PROJECT_FILE = "project.json";
    private const string DOMAINS_FOLDER = "domains";
    private const string MAIN_DOMAIN_ID = "main";
    private const string MAIN_DOMAIN_NAME = "Main";
    private const string LEGACY_FULL_DOMAIN_NAME = "fulldomain";
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
    {
        MigrateLegacyFullDomain(userSectionId, projectId);
        return ReadOptional<MainDomainFile>(DomainPath(userSectionId, projectId, MAIN_DOMAIN_ID))?.FullDomain;
    }

    public void SaveFullDomain(string userSectionId, string projectId, FullDomainDto fullDomain)
    {
        ArgumentNullException.ThrowIfNull(fullDomain);
        var path = DomainPath(userSectionId, projectId, MAIN_DOMAIN_ID);
        var main = ReadOptional<MainDomainFile>(path) ?? new MainDomainFile { Id = MAIN_DOMAIN_ID, Name = MAIN_DOMAIN_NAME };
        main.FullDomain = fullDomain;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        WriteJson(path, main);
        MigrateLegacyFullDomain(userSectionId, projectId);
    }

    public IReadOnlyList<DomainDto> GetDomains(string userSectionId, string projectId)
    {
        MigrateLegacyFullDomain(userSectionId, projectId);
        var folder = DomainsFolder(userSectionId, projectId);
        if (!Directory.Exists(folder))
            return [];

        return Directory.EnumerateFiles(folder, "*.json")
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
        if (!domain.Id.Equals(MAIN_DOMAIN_ID, StringComparison.OrdinalIgnoreCase))
        {
            WriteJson(path, domain);
            return;
        }

        // Keeps the FullDomain already stored in main.json; only the domain's own fields change.
        var fullDomain = ReadOptional<MainDomainFile>(path)?.FullDomain;
        WriteJson(path, new MainDomainFile
        {
            Id = domain.Id,
            Name = domain.Name,
            Description = domain.Description,
            Entities = domain.Entities,
            FullDomain = fullDomain,
        });
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

    private string DomainPath(string userSectionId, string projectId, string domainId)
    {
        var name = ValidFileName(domainId, "Domain ID");
        if (name.Equals(LEGACY_FULL_DOMAIN_NAME, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Domain ID is reserved.", nameof(domainId));
        return Path.Combine(DomainsFolder(userSectionId, projectId), $"{name}.json");
    }

    /// <summary>
    /// Moves a legacy <c>domains/fulldomain.json</c> into <c>main.json</c> and deletes it. A no-op once migrated.
    /// The main file's own FullDomain wins if both exist.
    /// </summary>
    private void MigrateLegacyFullDomain(string userSectionId, string projectId)
    {
        var legacyPath = Path.Combine(DomainsFolder(userSectionId, projectId), $"{LEGACY_FULL_DOMAIN_NAME}.json");
        if (!File.Exists(legacyPath))
            return;

        var legacy = ReadOptional<FullDomainDto>(legacyPath)
            ?? throw new InvalidDataException($"Legacy full domain file '{legacyPath}' is missing.");
        var mainPath = DomainPath(userSectionId, projectId, MAIN_DOMAIN_ID);
        var main = ReadOptional<MainDomainFile>(mainPath) ?? new MainDomainFile { Id = MAIN_DOMAIN_ID, Name = MAIN_DOMAIN_NAME };
        main.FullDomain ??= legacy;
        WriteJson(mainPath, main);
        File.Delete(legacyPath);
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

    /// <summary>The Main domain file: the domain's fields plus the FullDomain it is built from.</summary>
    private sealed class MainDomainFile
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public List<SubDomainEntityDto> Entities { get; set; } = [];
        public FullDomainDto? FullDomain { get; set; }
    }
}
