namespace OQuery.UI.Abstracts;

/// <summary>
/// Helpers for built-in data folders configured under OQuery:Repositories:Files:BuiltinData
/// and OQuery:Seeds:DataSets. A missing folder contributes no files.
/// </summary>
public static class BuiltinDatasets
{
    public const string DomainsFolder = "Domains";
    public const string MetadataFolder = "Metadata";
    public const string QueriesFolder = "Queries";

    public static string GetRootDirectory(string? fileStoragePath)
    {
        if (string.IsNullOrWhiteSpace(fileStoragePath))
            throw new InvalidOperationException("Configured storage path is missing.");
        return Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, fileStoragePath));
    }

    public static IEnumerable<string> EnumerateFiles(
        IEnumerable<string> folders,
        params string[] extensions)
    {
        foreach (var folder in folders)
        {
            if (!Directory.Exists(folder))
                continue;

            foreach (var path in Directory.EnumerateFiles(folder)
                .Where(path => extensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
            {
                yield return path;
            }
        }
    }

    /// <summary>Finds seed scripts named "*.{provider}.sql" in each dataset folder.</summary>
    public static IEnumerable<string> EnumerateScripts(IEnumerable<string> dataSetFolders, string provider)
    {
        var suffix = $".{provider}.sql";
        foreach (var folder in dataSetFolders)
        {
            if (!Directory.Exists(folder))
                continue;

            foreach (var path in Directory.EnumerateFiles(folder, "*.sql")
                .Where(path => Path.GetFileName(path).EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
            {
                yield return path;
            }
        }
    }
}

