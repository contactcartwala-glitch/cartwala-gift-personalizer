import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
export const loader = async ({ request }: LoaderFunctionArgs) => { await authenticate.admin(request); return redirect("/app/product-groups"); };
export default function AcrylicPricesRedirect() { return null; }
