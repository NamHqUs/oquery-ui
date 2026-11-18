namespace OQuery.UI.Abstracts.Repositories;

/// <summary>
/// Load and save only. Built-in items are passed to the repository by the consumer when it is constructed;
/// the repository returns them with the user's items but never lets them be saved or deleted.
/// </summary>
public interface IRepository<T>
{
    /// <summary>Returns built-in items (if this repository holds any) followed by the user's items.</summary>
    IReadOnlyCollection<T> GetAll(string userSectionId);
    T? Get(string userSectionId, string id);
    void Save(string userSectionId, T item);
    bool Delete(string userSectionId, string id);
}
