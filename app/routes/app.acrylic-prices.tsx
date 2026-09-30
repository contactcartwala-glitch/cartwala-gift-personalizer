import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { ACRYLIC_MULTIPLIER, ACRYLIC_SIZES } from "../lib/acrylic-prices";
import {
  ACRYLIC_COLLECTION_ID, loadAcrylicMatrix, saveAcrylicMatrix,
  syncAcrylicCollection, validateMatrix, type AcrylicMatrix,
} from "../lib/acrylic-prices.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return { matrix: await loadAcrylicMatrix(admin), collectionId: ACRYLIC_COLLECTION_ID };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    let matrix: AcrylicMatrix;
    if (form.get("intent") === "save") {
      matrix = validateMatrix({
        version: 1, multiplier: ACRYLIC_MULTIPLIER,
        sizes: ACRYLIC_SIZES.map((size, index) => ({
          size, cost3: Number(form.get(`cost3-${index}`)), cost5: Number(form.get(`cost5-${index}`)),
        })),
      });
      await saveAcrylicMatrix(admin, matrix);
    } else if (form.get("intent") === "sync") {
      matrix = await loadAcrylicMatrix(admin);
    } else throw new Error("Unknown action.");
    const report = await syncAcrylicCollection(admin, matrix);
    return { ok: report.errors.length === 0 && report.incomplete.length === 0, report, message: report.errors.length || report.incomplete.length
      ? "Some designs could not be synced. Check their size and acrylic variants, then sync again."
      : "Price table saved and tagged designs checked." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), report: null };
  }
};

export default function AcrylicPrices() {
  const { matrix, collectionId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [rows, setRows] = useState(matrix.sizes);
  const busy = navigation.state !== "idle";
  const setCost = (index: number, key: "cost3" | "cost5", value: string) =>
    setRows((previous) => previous.map((row, rowIndex) => rowIndex === index
      ? { ...row, [key]: Number(value) } : row));

  return (
    <s-page heading="Acrylic Photo Frames · Prices">
      <s-section heading="One price table for every design">
        <p>These five sizes use 3mm acrylic without studs or 5mm acrylic with studs. Selling price = base cost × 2.5. Save to update every tagged design in this collection.</p>
        <p>Plain photo products offer Portrait and Landscape. For a designed product, duplicate the matching Portrait or Landscape draft template, upload its design, and keep the Size and Acrylic variants plus the cw-acrylic-frame tag. Designed products have no customer orientation choice. Prices depend only on size and acrylic thickness.</p>
        <p><s-link href={`shopify://admin/collections/${collectionId.split("/").pop()}`}>Open Acrylic Photo Frames collection</s-link></p>
      </s-section>
      <s-section heading="Base costs and selling prices (₹)">
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
              <thead><tr><th scope="col">Size (inches)</th><th scope="col">3mm base</th><th scope="col">3mm selling</th><th scope="col">5mm base</th><th scope="col">5mm selling</th></tr></thead>
              <tbody>{rows.map((row, index) => <tr key={row.size}>
                <th scope="row">{row.size}</th>
                <td><input aria-label={`${row.size} 3mm base cost`} name={`cost3-${index}`} type="number" min="1" max="1000000" step="1" required value={row.cost3} onChange={(event) => setCost(index, "cost3", event.target.value)} style={{ width: 110, padding: 8 }} /></td>
                <td>₹{(row.cost3 * ACRYLIC_MULTIPLIER).toLocaleString("en-IN")}</td>
                <td><input aria-label={`${row.size} 5mm base cost`} name={`cost5-${index}`} type="number" min="1" max="1000000" step="1" required value={row.cost5} onChange={(event) => setCost(index, "cost5", event.target.value)} style={{ width: 110, padding: 8 }} /></td>
                <td>₹{(row.cost5 * ACRYLIC_MULTIPLIER).toLocaleString("en-IN")}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p><button type="submit" disabled={busy} style={{ padding: "10px 16px", cursor: busy ? "wait" : "pointer" }}>{busy ? "Saving and syncing…" : "Save and sync all designs"}</button></p>
        </Form>
        <Form method="post"><input type="hidden" name="intent" value="sync" /><button type="submit" disabled={busy}>Sync existing prices again</button></Form>
        {actionData && <div role="status" style={{ marginTop: 16 }}>
          <strong>{actionData.message}</strong>
          {actionData.report && <p>{actionData.report.updated} updated · {actionData.report.unchanged} already correct</p>}
          {actionData.report?.incomplete.length ? <p>Needs the complete size and acrylic variant set: {actionData.report.incomplete.join(", ")}</p> : null}
          {actionData.report?.errors.length ? <p>Errors: {actionData.report.errors.join("; ")}</p> : null}
        </div>}
      </s-section>
    </s-page>
  );
}
