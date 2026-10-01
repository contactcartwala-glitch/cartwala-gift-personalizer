export default function MasterProducts() {
  return <s-section heading="Master Products">
    <s-stack direction="block" gap="base">
      <s-paragraph>Manage master sizes, prices and mockups here. No product selection is needed.</s-paragraph>
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="base">
          <s-heading>Acrylic Photo Frame</s-heading>
          <s-paragraph>Sizes &amp; prices · 3mm / 5mm · Portrait / Landscape · Master PNGs · Test photo preview</s-paragraph>
          <s-button variant="primary" href="/app/acrylic-prices">Manage Acrylic Photo Frame</s-button>
        </s-stack>
      </s-box>
    </s-stack>
  </s-section>;
}
