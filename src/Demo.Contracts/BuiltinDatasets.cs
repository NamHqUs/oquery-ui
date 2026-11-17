namespace Demo.Contracts;

/// <summary>
/// Locates built-in data under {Setup:BuiltinPath}/{dataset}/{domains|metadata|queries|scripts}.
/// A missing dataset or folder contributes no files.
/// </summary>
public static class BuiltinDatasets
{
    public const string DomainsFolder = "domains";
    public const string MetadataFolder = "metadata";
    public const string QueriesFolder = "queries";
    public const string ScriptsFolder = "scripts";

    public static string GetRootDirectory(string? fileStoragePath)
    {
        if (string.IsNullOrWhiteSpace(fileStoragePath))
            throw new InvalidOperationException("Configured storage path is missing.");
        return Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, fileStoragePath));
    }

    public static IEnumerable<string> EnumerateFiles(
        string rootDirectory,
        IEnumerable<string> dataSets,
        string folder,
        params string[] extensions)
    {
        foreach (var dataSet in dataSets)
        {
            var directory = Path.Combine(rootDirectory, dataSet, folder);
            if (!Directory.Exists(directory))
                continue;

            foreach (var path in Directory.EnumerateFiles(directory)
                .Where(path => extensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
            {
                yield return path;
            }
        }
    }

    public static string GetScriptPath(string rootDirectory, string dataSet, string provider)
        => Path.Combine(rootDirectory, dataSet, ScriptsFolder, $"{dataSet}.{provider}.sql".ToLowerInvariant());
}
