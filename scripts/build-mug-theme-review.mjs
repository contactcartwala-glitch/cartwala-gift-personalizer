import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Buffer } from 'node:buffer';

const [layoutPath, outputDir] = process.argv.slice(2);
if (!layoutPath || !outputDir) throw new Error("Usage: node scripts/build-mug-theme-review.mjs ORIGINAL_LAYOUT OUTPUT_DIRECTORY");
const assets = "extensions/cartwala-personalizer/assets/";
const labels = JSON.parse(fs.readFileSync("extensions/cartwala-personalizer/locales/en.default.json", "utf8")).mug_preview;
const bootstrap = `(() => {
  const labels = ${JSON.stringify(labels)};
  const loader = document.currentScript;
  document.querySelectorAll('[data-cw-personalizer][data-product-kind="mug"]').forEach(root => {
    root.dataset.cwMugReview = '20261011';
    if (loader.dataset.cwMugStudioScript) {
      root.dataset.cwMugStudioScript = loader.dataset.cwMugStudioScript;
      root.dataset.cwMugStudioModel = loader.dataset.cwMugStudioModel;
      root.dataset.cwMugStudioLabels = JSON.stringify(labels);
    }
    const save = root.querySelector('[data-cw-save]');
    if (save && !root.querySelector('[data-cw-mug-editor-preview]')) {
      const actions = document.createElement('div');
      actions.className = 'cw-personalizer__toolbar-actions';
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'cw-mug-editor-preview';
      preview.dataset.cwMugEditorPreview = '';
      preview.dataset.loadingLabel = labels.preparing;
      preview.textContent = labels.editor_preview;
      preview.disabled = true;
      save.before(actions);
      actions.append(preview, save);
    }
    const stage = root.querySelector('[data-cw-mug-stage]');
    if (stage && !root.querySelector('[data-cw-mug-reset]')) {
      const controls = document.createElement('div');
      controls.className = 'cw-mug-modal__controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', labels.view_controls);
      for (const [action, text, label] of [['out','−',labels.zoom_out],['reset',labels.reset_view,labels.reset_view],['in','+',labels.zoom_in]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', label);
        if (action === 'reset') button.dataset.cwMugReset = '';
        else button.dataset.cwMugZoom = action;
        controls.append(button);
      }
      stage.after(controls);
      const help = root.querySelector('.cw-mug-modal__panel > p');
      if (help) help.textContent = labels.free_drag_help;
    }
    if (root.dataset.cwMugStudioScript) {
      root.querySelector('.cw-mug-modal__controls')?.remove();
      const heading = root.querySelector('.cw-mug-modal__panel > header h2');
      if (heading) heading.textContent = labels.studio_title;
      const help = root.querySelector('.cw-mug-modal__panel > p');
      if (help) {
        help.textContent = labels.studio_help;
        const brand = document.createElement('strong');
        brand.className = 'cw-mug-modal__brand';
        brand.textContent = labels.preview_brand;
        help.append(document.createElement('br'), brand);
      }
    }
  });
})();\n`;
const layout = fs.readFileSync(layoutPath, "utf8");
if (!layout.includes("{{ content_for_header }}")) throw new Error("Expected content_for_header marker missing");
const condition = "request.page_type == 'product' and product.tags contains 'cw-mug'";
const loader = `<script src="{{ 'cartwala-mug-3d-review.js' | asset_url }}" defer data-cw-mug-studio-script="{{ 'cartwala-mug-studio.js' | asset_url }}" data-cw-mug-studio-model="{{ 'cartwala-white-mug.glb' | asset_url }}"></script>`;
const patch = `{% if ${condition} %}${loader}{% endif %}\n{{ content_for_header }}\n{% if ${condition} %}{{ 'cartwala-mug-3d-review.css' | asset_url | stylesheet_tag }}{% endif %}`;
const updatedLayout = layout.includes('cartwala-mug-3d-review.js')
  ? layout.replace(/<script src="{{ 'cartwala-mug-3d-review.js' \| asset_url }}"[^>]*>[\s\S]*?<\/script>/, loader)
  : layout.replace("{{ content_for_header }}", patch);
const files = [
  { filename: "assets/cartwala-mug-3d-review.js", body: { type: "TEXT", value: bootstrap + fs.readFileSync(assets + "cartwala-personalizer.js", "utf8") } },
  { filename: "assets/cartwala-mug-3d-review.css", body: { type: "TEXT", value: fs.readFileSync(assets + "cartwala-personalizer.css", "utf8") } },
  { filename: "layout/theme.liquid", body: { type: "TEXT", value: updatedLayout } },
  ...['cartwala-mug-studio.js','cartwala-three-license.txt'].map(name=>({filename:'assets/'+name,body:{type:'TEXT',value:fs.readFileSync(assets+name,'utf8')}})),
  {filename:'assets/cartwala-white-mug.glb',body:{type:'BASE64',value:fs.readFileSync(assets+'cartwala-white-mug.glb').toString('base64')}},
];
for (const file of files) {
  const dest = path.join(outputDir, file.filename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.body.type === 'BASE64' ? Buffer.from(file.body.value,'base64') : file.body.value);
}
fs.writeFileSync(path.join(outputDir, "files.json"), JSON.stringify(files));
console.log(`Built ${files.length} files for an unpublished mug review theme`);
