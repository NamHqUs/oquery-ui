using System.Reflection;
using OQuery.Database;
using OQuery.UI.Api.Services.DbSchemaLoaders;

namespace OQuery.UI.Application;

/// <summary>
/// Discovers dialect packages (OQuery.&lt;Db&gt;.dll) in a folder and registers each dialect with the API.
/// A dialect module is a static class whose name ends with "DialectModule" and exposes a public static
/// parameterless CreateDialect() method returning ISqlDialect. The provider name is the module name without the suffix;
/// an optional public static string[] ProviderAliases property adds alternative provider names.
/// Provisioning (DbSchemaLoader) is owned by the API, so the factories below are keyed by provider name.
/// Packages can be added or removed without changing the API build.
/// </summary>
public static class DialectModules
{
    private const string ModuleSuffix = "DialectModule";
    private const string CreateDialectMethodName = "CreateDialect";
    private const string AliasesPropertyName = "ProviderAliases";

    private static readonly Dictionary<string, Func<string, string[], string, DbSchemaLoader>> DbInstanceFactories =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Sqlite"] = (connectionString, scriptFiles, dbVersion) => new SqliteDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["SqlServer"] = (connectionString, scriptFiles, dbVersion) => new SqlServerDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Postgres"] = (connectionString, scriptFiles, dbVersion) => new PostgresDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Cockroach"] = (connectionString, scriptFiles, dbVersion) => new CockroachDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["MySql"] = (connectionString, scriptFiles, dbVersion) => new MySqlDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Oracle"] = (connectionString, scriptFiles, dbVersion) => new OracleDbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Db2"] = (connectionString, scriptFiles, dbVersion) => new Db2DbSchemaLoader(connectionString, scriptFiles, dbVersion),
            ["Firebird"] = (connectionString, scriptFiles, dbVersion) => new FirebirdDbSchemaLoader(connectionString, scriptFiles, dbVersion),
        };

    public static IReadOnlyList<string> RegisterFromFolder(string folder)
    {
        if (!Directory.Exists(folder))
            return [];

        var loadedNames = AppDomain.CurrentDomain.GetAssemblies()
            .Select(assembly => assembly.GetName().Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var registered = new List<string>();
        foreach (var path in Directory.EnumerateFiles(folder, "*.dll").Order(StringComparer.OrdinalIgnoreCase))
        {
            if (loadedNames.Contains(AssemblyName.GetAssemblyName(path).Name ?? string.Empty))
                continue;

            foreach (var module in GetModuleTypes(Assembly.LoadFrom(path)))
            {
                try
                {
                    var name = module.Name[..^ModuleSuffix.Length];
                    var createDialect = module
                        .GetMethod(CreateDialectMethodName, BindingFlags.Public | BindingFlags.Static, Type.EmptyTypes)!
                        .CreateDelegate<Func<ISqlDialect>>();
                    SqlDialectRegistry.Register(new SqlDialectRegistration(
                        name,
                        createDialect,
                        DbInstanceFactories.GetValueOrDefault(name),
                        GetAliases(module)));
                }
                catch (TargetInvocationException ex) when (ex.InnerException is not null)
                {
                    throw new InvalidOperationException(
                        $"Failed to register dialect module '{module.FullName}' from '{path}'.", ex.InnerException);
                }
                registered.Add(module.FullName!);
            }
        }
        return registered;
    }

    private static IReadOnlyList<string>? GetAliases(Type module)
        => module.GetProperty(AliasesPropertyName, BindingFlags.Public | BindingFlags.Static)?.GetValue(null) as string[];

    public static IEnumerable<Type> GetModuleTypes(Assembly assembly)
    {
        Type?[] types;
        try
        {
            types = assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            types = ex.Types;
        }
        return types.Where(type => type is not null && IsDialectModule(type))!;
    }

    private static bool IsDialectModule(Type type)
        => type is { IsClass: true, IsAbstract: true, IsSealed: true }
           && type.Name.EndsWith(ModuleSuffix, StringComparison.Ordinal)
           && type.GetMethod(CreateDialectMethodName, BindingFlags.Public | BindingFlags.Static, Type.EmptyTypes) is { } method
           && method.ReturnType == typeof(ISqlDialect);
}
