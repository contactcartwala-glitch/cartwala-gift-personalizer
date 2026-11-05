import type { ActionFunctionArgs } from "react-router";
import { useSearchParams } from "react-router";
import { AcrylicPrices, loader, action as masterAction } from "./app.acrylic-prices";
import { PersonalizerHome, action as designAction } from "./app._index";

export { loader };
export async function action(args: ActionFunctionArgs) {
  return ["designs", "frame-designs"].includes(new URL(args.request.url).searchParams.get("view") || "")
    ? designAction(args) : masterAction(args);
}
export default function MasterProductsPage() {
  const [params] = useSearchParams();
  if (params.get("view") === "frame-designs") return <PersonalizerHome key="frame-designs" masterMode masterKind="frame" />;
  return params.get("view") === "designs"
    ? <PersonalizerHome key="acrylic-designs" masterMode />
    : <AcrylicPrices masterMode />;
}
