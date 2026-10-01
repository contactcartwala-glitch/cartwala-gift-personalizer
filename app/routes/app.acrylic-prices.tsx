import { useState } from "react";
import { useActionData, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import AcrylicMockupEditor from "../components/AcrylicMockupEditor";
import { acrylicChoice } from "../lib/acrylic-mockups";
import { loadAcrylicMockups, saveAcrylicMockup, uploadAcrylicMockup } from "../lib/acrylic-mockups.server";
import {
  ACRYLIC_ACTIVE_PRODUCT_ID, addAcrylicSizes, loadAcrylicMatrix,
  loadAcrylicProduct, saveAcrylicMatrix, syncAcrylicProduct, validateMatrix,
} from "../lib/acrylic-prices.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [matrix, product, mockups] = await Promise.all([
    loadAcrylicMatrix(admin), loadAcrylicProduct(admin, ACRYLIC_ACTIVE_PRODUCT_ID),
    loadAcrylicMockups(admin),
  ]);
  if (!product) throw new Response("Active acrylic frame not found.", { status: 404 });
  return { matrix, productTitle: product.title, variantCount: product.variants.nodes.length, mockups,
    previewSizes: [...new Set(product.variants.nodes.map(v => v.selectedOptions.find(o => o.name === "Size")?.value.replace(/ inches$/, "")).filter((s): s is string => !!s))] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    const product = await loadAcrylicProduct(admin, ACRYLIC_ACTIVE_PRODUCT_ID);
    if (!product || !product.tags.includes("cw-acrylic-frame"))
      throw new Error("The active acrylic frame was not found.");
    const intent = String(form.get("intent") || "prices");
    if (intent === "uploadMockup" || intent === "saveMockup") {
      const choice = String(form.get("choice") || "");
      const choices = product.variants.nodes.map(v => {
        const options = new Map<string, string>(v.selectedOptions.map(o => [o.name, o.value]));
        return acrylicChoice(options.get("Size") || "", (options.get("Thickness") || options.get("Acrylic") || "").match(/^(3|5)mm/)?.[0] || "", options.get("Orientation") || "Portrait");
      });
      if (!choices.includes(choice)) throw new Error("Save the new size first, then choose its mockup.");
      if (intent === "uploadMockup") {
        const file = form.get("file");
        if (!(file instanceof File)) throw new Error("Choose a transparent PNG.");
        const mockupUpload = await uploadAcrylicMockup(admin, file, choice);
        return { ok: true, choice, mockupUpload, message: "PNG ready. Test the preview, then save the selected mockup." };
      }
      await saveAcrylicMockup(admin, choice, JSON.parse(String(form.get("template") || "null")), String(form.get("digest") || "") || null);
      return { ok: true, choice, mockupSaved: true, message: "Selected mockup saved. It will be used for this size, thickness and orientation." };
    }
    if (intent !== "prices") throw new Error("Unknown acrylic action.");
    const matrix = validateMatrix(JSON.parse(String(form.get("matrix") || "null")));
    const presentSizes = new Set(product.variants.nodes.map(variant =>
      variant.selectedOptions.find(option => option.name === "Size")?.value.replace(/ inches$/, "")));
    if ([...presentSizes].some(size => !matrix.sizes.some(row => row.size === size)))
      throw new Error("A size already on the product cannot be removed from this price editor.");
    await addAcrylicSizes(admin, product, matrix);
    const fresh = await loadAcrylicProduct(admin, ACRYLIC_ACTIVE_PRODUCT_ID);
    if (!fresh) throw new Error("Could not reload the acrylic frame.");
    const result = await syncAcrylicProduct(admin, fresh, matrix);
    if (result === "incomplete")
      throw new Error("Variant choices do not match the price table. No existing variants were changed.");
    await saveAcrylicMatrix(admin, matrix);
    return { ok: true, message: "Acrylic frame sizes and prices saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save acrylic prices." };
  }
};

export default function AcrylicPrices() {
  const { matrix: initial, productTitle, variantCount, mockups, previewSizes } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [rows, setRows] = useState(initial.sizes);
  const [newSize, setNewSize] = useState("");
  const [newPrice3, setNewPrice3] = useState("");
  const [newPrice5, setNewPrice5] = useState("");
  const update = (index: number, field: "price3" | "price5", value: string) =>
    setRows(current => current.map((row, i) => i === index ? { ...row, [field]: Number(value) } : row));
  const add = () => {
    const size = newSize.trim().replace(/\s*[x×]\s*/g, "×");
    if (!/^\d+(?:\.\d+)?×\d+(?:\.\d+)?$/.test(size) || rows.some(row => row.size === size)) return;
    setRows(current => [...current, { size, price3: Number(newPrice3), price5: Number(newPrice5) }]);
    setNewSize(""); setNewPrice3(""); setNewPrice5("");
  };
  return <s-page heading="Acrylic sizes, prices & mockups" inlineSize="large">
    <AcrylicMockupEditor sizes={previewSizes} templates={mockups.templates} digest={mockups.digest} />
    <s-section heading={productTitle}>
      <s-paragraph>Manage this product only. Existing photos and variants are preserved. Portrait and Landscape share each size price. Current variants: {variantCount}.</s-paragraph>
      {result?.message && <s-paragraph>{result.message}</s-paragraph>}
      <form method="post">
        <input type="hidden" name="matrix" value={JSON.stringify({ version: 2, sizes: rows })} />
        <table style={{ width: "100%", borderSpacing: "0 12px" }}>
          <thead><tr><th scope="col">Size (inches)</th><th scope="col">3mm without studs (₹)</th><th scope="col">5mm with studs (₹)</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.size}>
            <th scope="row">{row.size}</th>
            <td><input aria-label={`${row.size} 3mm price`} type="number" min="1" step="0.01" value={row.price3} onChange={event => update(index, "price3", event.currentTarget.value)} required /></td>
            <td><input aria-label={`${row.size} 5mm price`} type="number" min="1" step="0.01" value={row.price5} onChange={event => update(index, "price5", event.currentTarget.value)} required /></td>
          </tr>)}</tbody>
        </table>
        <button type="submit">Save acrylic prices</button>
      </form>
    </s-section>
    <s-section heading="Add a size to this product">
      <s-paragraph>Enter the physical size and both selling prices. Saving creates Portrait and Landscape variants for 3mm and 5mm.</s-paragraph>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <input aria-label="New size in inches" placeholder="e.g. 18×24" value={newSize} onChange={event => setNewSize(event.currentTarget.value)} />
        <input aria-label="New 3mm price" type="number" min="1" step="0.01" placeholder="3mm ₹" value={newPrice3} onChange={event => setNewPrice3(event.currentTarget.value)} />
        <input aria-label="New 5mm price" type="number" min="1" step="0.01" placeholder="5mm ₹" value={newPrice5} onChange={event => setNewPrice5(event.currentTarget.value)} />
        <button type="button" onClick={add}>Add size</button>
      </div>
    </s-section>
  </s-page>;
}
