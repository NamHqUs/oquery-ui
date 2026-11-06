using Demo.Contracts.Dto;

namespace Demo.Contracts.Services;

public interface IOQuerySuggestionService
{
    OQuerySuggestionResponse GetSuggestions(OQuerySuggestionRequest request);
}
