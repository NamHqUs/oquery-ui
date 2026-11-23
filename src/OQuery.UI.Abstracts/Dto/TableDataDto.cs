
using System.Text;

public record TableDataDto(string Name, string[] Columns, string[][] Rows, int? Page, int? PageSize, long TotalRecords)
{
    public override string ToString()
    {
        StringBuilder sb = new();
        sb.AppendLine($"Name: {Name}");
        sb.AppendLine($"Columns: {string.Join(",", Columns)}");
        sb.AppendLine($"Rows (top 2): \n -{string.Join("\n -", Rows.Take(2).Select(row => string.Join(",", row)))}");
        sb.AppendLine($"Page: {Page}");
        sb.AppendLine($"PageSize: {PageSize}");
        sb.AppendLine($"TotalRecords: {TotalRecords}");
        return sb.ToString();
    }
}
