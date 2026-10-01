import { useSearchParams } from "react-router";

export function MasterProductNavigation({ designs = false }: { designs?: boolean }) {
  const [params] = useSearchParams();
  const href = (view: string) => {
    const next = new URLSearchParams(params);
    next.set("view", view);
    return `/app/master-products?${next}`;
  };
  return <s-section heading="Acrylic Photo Frame Master">
    <s-paragraph>Manage master sizes, prices, mockups and linked PSD designs in Master Products.</s-paragraph>
    <nav aria-label="Acrylic master settings" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <a href={href("master")} aria-current={!designs ? "page" : undefined}>Sizes, prices &amp; master photos</a>
      <a href={href("designs")} aria-current={designs ? "page" : undefined}>Designs, PSD upload &amp; preview</a>
    </nav>
  </s-section>;
}
export default function MasterProducts() {
  return <s-section heading="Master Products">
    <s-paragraph>Acrylic sizes, prices, 3mm / 5mm, master photos and linked design PSDs.</s-paragraph>
    <s-button variant="primary" href="/app/master-products">Manage Acrylic Photo Frame</s-button>
  </s-section>;
}
