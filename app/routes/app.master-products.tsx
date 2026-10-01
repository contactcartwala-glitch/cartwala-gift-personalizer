import type { ActionFunctionArgs } from "react-router";
import { useSearchParams } from "react-router";
import AcrylicPrices, { loader, action as masterAction } from "./app.acrylic-prices";
import PersonalizerHome, { action as designAction } from "./app._index";

export { loader };
export async function action(args: ActionFunctionArgs) {
  return new URL(args.request.url).searchParams.get("view") === "designs"
    ? designAction(args) : masterAction(args);
}
export default function MasterProductsPage() {
  const [params] = useSearchParams();
  return params.get("view") === "designs"
    ? <PersonalizerHome masterMode />
    : <AcrylicPrices masterMode />;
}
