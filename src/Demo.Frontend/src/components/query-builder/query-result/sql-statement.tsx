import "./sql-statement.css";

type SqlStatementProps = {
  statement: string;
};

const sqlKeywordPattern = /\b(WITH|SELECT|FROM|WHERE|GROUP|BY|HAVING|ORDER|LIMIT|OFFSET|ASC|DESC|AS|AND|OR|IN|IS|NULL|LIKE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|DISTINCT|TOP)\b/i;
const sqlTokenPattern = /(\b(?:WITH|SELECT|FROM|WHERE|GROUP|BY|HAVING|ORDER|LIMIT|OFFSET|ASC|DESC|AS|AND|OR|IN|IS|NULL|LIKE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|DISTINCT|TOP)\b)/gi;

export default function SqlStatement({ statement }: SqlStatementProps) {
  return (
    <pre className="sql-statement">
      <code>
        {statement.split(sqlTokenPattern).map((token, index) => sqlKeywordPattern.test(token)
          ? <span className="sql-keyword" key={`${token}-${index}`}>{token}</span>
          : token)}
      </code>
    </pre>
  );
}
