import { useSearchParams } from "react-router";

export function MasterProductNavigation({ designs = false, canNavigate }: { designs?: boolean; canNavigate?: () => boolean }) {
  const [params, setParams] = useSearchParams();
  const open = (view: string) => {
    if (canNavigate && !canNavigate()) return;
    const next = new URLSearchParams(params);
    next.set("view", view);
    setParams(next);
  };
  return <s-section heading="Acrylic Photo Frame Master">
    <s-paragraph>Manage master sizes, prices, mockups and linked PSD designs in Master Products.</s-paragraph>
    <nav aria-label="Acrylic master settings" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <s-button variant={!designs ? "primary" : "secondary"} onClick={() => open("master")}>Sizes, prices &amp; master photos</s-button>
      <s-button variant={designs ? "primary" : "secondary"} onClick={() => open("designs")}>Designs, PSD upload &amp; preview</s-button>
    </nav>
  </s-section>;
}
export default function MasterProducts() {
  return <s-section heading="Master Products">
    <s-paragraph>Acrylic sizes, prices, 3mm / 5mm, master photos and linked design PSDs.</s-paragraph>
    <s-button variant="primary" href="/app/master-products">Manage Acrylic Photo Frame</s-button>
  </s-section>;
}
