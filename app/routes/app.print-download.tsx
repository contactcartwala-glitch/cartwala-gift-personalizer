import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { preparePrintDownload, readPreparedPrintDownload } from "../lib/prepared-print-download.server";
export const action = async ({request}: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (session.shop !== "0k9icg-ns.myshopify.com") return new Response("Forbidden",{status:403});
  return preparePrintDownload(request, session.shop);
};
// A 256-bit capability issued only after staff authentication, expiring in 15 minutes.
// Direct file downloads cannot attach the embedded App Bridge bearer token.
export const loader = ({request}: LoaderFunctionArgs) => readPreparedPrintDownload(request);
