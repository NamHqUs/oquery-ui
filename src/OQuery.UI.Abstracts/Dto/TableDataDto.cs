
using System.Text;

public record TableDataDto(string Name, string Columns, string[] Rows, int? Page, int? PageSize, long TotalRecords)
{
    public override string ToString()
    {
        StringBuilder sb = new();
        sb.AppendLine($"Name: {Name}");
        sb.AppendLine($"Columns: {Columns}");
        sb.AppendLine($"Rows (top 2): \n -{string.Join("\n -", Rows.Take(2))}");
        sb.AppendLine($"Page: {Page}");
        sb.AppendLine($"PageSize: {PageSize}");
        sb.AppendLine($"TotalRecords: {TotalRecords}");
        return sb.ToString();
    }
}
