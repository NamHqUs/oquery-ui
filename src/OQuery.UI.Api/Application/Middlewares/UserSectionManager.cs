using OQuery.UI.Abstracts.Application;

namespace OQuery.UI.Application.Middlewares;

public class UserSectionManager : IUserSectionManager
{
    public string GetSectionId()
    {
        return "123";
    }
}
