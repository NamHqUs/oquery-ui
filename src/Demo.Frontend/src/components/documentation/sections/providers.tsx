import { useSelector } from "react-redux";
import Icon, { getDatabaseIconName } from "../../icon/icon";
import type { RootState } from "../../../store/store";

export default function ProvidersContent() {
  const providers = useSelector((state: RootState) => state.database.providers);

  return (
    <div className="doc-provider-list">
      {providers.map((provider) => (
        <span key={provider}>
          <Icon name={getDatabaseIconName(provider)} size={13} />
          {provider}
        </span>
      ))}
    </div>
  );
}
