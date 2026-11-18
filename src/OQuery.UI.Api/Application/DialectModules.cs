using System.Reflection;

namespace OQuery.UI.Application;

/// <summary>
/// Discovers dialect packages (OQuery.&lt;Db&gt;.dll) in a folder and invokes their dialect module registration.
/// A dialect module is a static class whose name ends with "DialectModule" and exposes a public static
/// parameterless Register() method. Packages can be added or removed without changing the API build.
/// </summary>
public static class DialectModules
{
    private const string ModuleSuffix = "DialectModule";
    private const string RegisterMethodName = "Register";

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
                    module.GetMethod(RegisterMethodName, BindingFlags.Public | BindingFlags.Static, Type.EmptyTypes)!
                        .Invoke(null, null);
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
           && type.GetMethod(RegisterMethodName, BindingFlags.Public | BindingFlags.Static, Type.EmptyTypes) is not null;
}
