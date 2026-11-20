namespace OQuery.UI.Abstracts.Repositories;

/// <summary>
/// Load and save only. Built-in items are passed to the repository by the consumer when it is constructed;
/// the repository returns them with the user's items but never lets them be saved or deleted.
/// </summary>
public interface IRepository<T>
{
    /// <summary>Returns built-in items (if this repository holds any) followed by the user's items in the scope.</summary>
    IReadOnlyCollection<T> GetAll(StorageScope scope);
    T? Get(StorageScope scope, string id);
    void Save(StorageScope scope, T item);
    bool Delete(StorageScope scope, string id);
}
