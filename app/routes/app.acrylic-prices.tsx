import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { acrylicComparePrice, ACRYLIC_SIZES } from "../lib/acrylic-prices";
import {
  ACRYLIC_COLLECTION_ID, loadAcrylicMatrix, saveAcrylicMatrix, loadAcrylicRoom, saveAcrylicRoom,
  syncAcrylicCollection, validateMatrix, type AcrylicMatrix,
} from "../lib/acrylic-prices.server";

import { uploadImageAsset } from "../lib/shopify-files.server";

const DEFAULT_ROOM = "https://cdn.shopify.com/extensions/01a0f10f-2c0c-7f1b-8519-f2854ed801ae/cartwala-gift-personalizer-239/assets/cartwala-acrylic-room.jpg";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return { matrix: await loadAcrylicMatrix(admin), roomUrl: await loadAcrylicRoom(admin) || DEFAULT_ROOM, collectionId: ACRYLIC_COLLECTION_ID };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    if (form.get("intent") === "background") {
      const file = form.get("background");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a background image first.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
      const asset = await uploadImageAsset(admin, file);
      await saveAcrylicRoom(admin, asset.id);
      return { ok: true, report: null, message: "Background saved for all acrylic designs. Refresh the product page to see it." };
    }
    let matrix: AcrylicMatrix;
    if (form.get("intent") === "save") {
      matrix = validateMatrix({
        version: 2,
        sizes: ACRYLIC_SIZES.map((size, index) => ({
          size, price3: Number(form.get(`price3-${index}`)), price5: Number(form.get(`price5-${index}`)),
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
  const { matrix, collectionId, roomUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [rows, setRows] = useState(matrix.sizes);
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  useEffect(() => () => { if (pendingRoom) URL.revokeObjectURL(pendingRoom); }, [pendingRoom]);
  useEffect(() => { if (actionData?.ok) setPendingRoom(null); }, [actionData]);
  const busy = navigation.state !== "idle";
  const setPrice = (index: number, key: "price3" | "price5", value: string) =>
    setRows((previous) => previous.map((row, rowIndex) => rowIndex === index
      ? { ...row, [key]: Number(value) } : row));

  return (
    <s-page heading="Acrylic Photo Frames · Prices">
      <s-section heading="One price table for every design">
        <p>Edit your selling prices here. Save to update all tagged acrylic designs. The crossed-out price is automatically set 40% above the selling price.</p>
        <p>For a new design, upload the flat artwork as its first product image and use cw-acrylic-portrait or cw-acrylic-landscape. A new product with no custom options automatically receives all five sizes and both acrylic choices. The same room background shows your artwork at the selected size. Plain photo products retain the Portrait/Landscape choice. Both directions use the same prices.</p>
        <p><s-link href={`shopify://admin/collections/${collectionId.split("/").pop()}`}>Open Acrylic Photo Frames collection</s-link></p>
      </s-section>
      <s-section heading="Room / Sofa Background">
        <p>Change the shared room image here. Save once to update every acrylic design. Choose a square room photo with a clear wall above the sofa, similar to the preview.</p>
        <img src={pendingRoom || roomUrl} alt={pendingRoom ? "New background preview — not yet saved" : "Current room background"} style={{ width: "100%", maxWidth: 360, aspectRatio: "1", objectFit: "cover", borderRadius: 12, display: "block", marginBottom: 16 }} />
        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="intent" value="background" />
          <label htmlFor="acrylic-background">Upload / Change Image</label>
          <p><input id="acrylic-background" name="background" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            setPendingRoom(file ? URL.createObjectURL(file) : null);
          }} /></p>
          <p>JPG, PNG or WebP · Maximum 25 MB. Your customer artwork and prices stay the same.</p>
          <button type="submit" disabled={busy} style={{ padding: "10px 16px" }}>{busy ? "Saving…" : "Save background"}</button>
        </Form>
      </s-section>
      <s-section heading="Selling prices (₹)">
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
              <thead><tr><th scope="col">Size (inches)</th><th scope="col">3mm selling price</th><th scope="col">3mm crossed-out price</th><th scope="col">5mm selling price</th><th scope="col">5mm crossed-out price</th></tr></thead>
              <tbody>{rows.map((row, index) => <tr key={row.size}>
                <th scope="row">{row.size}</th>
                <td><input aria-label={`${row.size} 3mm selling price`} name={`price3-${index}`} type="number" min="1" max="10000000" step="0.01" required value={row.price3} onChange={(event) => setPrice(index, "price3", event.target.value)} style={{ width: 110, padding: 8 }} /></td>
                <td>₹{acrylicComparePrice(row.price3).toLocaleString("en-IN")}</td>
                <td><input aria-label={`${row.size} 5mm selling price`} name={`price5-${index}`} type="number" min="1" max="10000000" step="0.01" required value={row.price5} onChange={(event) => setPrice(index, "price5", event.target.value)} style={{ width: 110, padding: 8 }} /></td>
                <td>₹{acrylicComparePrice(row.price5).toLocaleString("en-IN")}</td>
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
