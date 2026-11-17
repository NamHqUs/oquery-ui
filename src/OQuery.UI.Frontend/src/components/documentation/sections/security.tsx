const CONTROLS = [
  {
    title: "Parameterize values",
    body: "Filters and typed literals are sent through ADO.NET parameters.",
  },
  {
    title: "Restrict metadata",
    body: "Expose only approved entities, fields, relationships, and functions.",
  },
  {
    title: "Limit resources",
    body: "Apply maximum page sizes, timeouts, join depth, and query cost rules.",
  },
  {
    title: "Trust raw SQL deliberately",
    body: "Raw table and field expressions are configuration, not user input.",
  },
];

export default function SecurityContent() {
  return (
    <div className="doc-cards cols-2">
      {CONTROLS.map((control) => (
        <div key={control.title} className="doc-card doc-card-plain">
          <strong>{control.title}</strong>
          <p>{control.body}</p>
        </div>
      ))}
    </div>
  );
}
