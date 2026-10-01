import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { acrylicChoice, choiceDimensions, type AcrylicMockup, type AcrylicMockups } from "../lib/acrylic-mockups";
import "../styles/acrylic-mockups.css";

export type MockupActionData = { ok: boolean; message?: string; choice?: string; mockupUpload?: AcrylicMockup; mockupSaved?: boolean };
type Props = { sizes: string[]; templates: AcrylicMockups; digest: string | null };
export default function AcrylicMockupEditor({ sizes, templates, digest }: Props) {
  const [size, setSize] = useState(sizes[0] || "8×12");
  const [thickness, setThickness] = useState("3mm");
  const [direction, setDirection] = useState("Portrait");
  const [drafts, setDrafts] = useState<AcrylicMockups>({});
  const [photo, setPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [zoom, setZoom] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useFetcher<MockupActionData>();
  const save = useFetcher<MockupActionData>();
  const choice = acrylicChoice(size, thickness, direction);
  const dirty = Object.prototype.hasOwnProperty.call(drafts, choice);
  const template = dirty ? drafts[choice] : templates[choice] || null;
  const dimensions = choiceDimensions(choice);
  const busy = upload.state !== "idle" || save.state !== "idle";
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  useEffect(() => {
    const result = upload.data;
    if (result?.ok && result.choice && result.mockupUpload)
      setDrafts(current => ({ ...current, [result.choice!]: result.mockupUpload! }));
  }, [upload.data]);
  useEffect(() => {
    const result = save.data;
    if (result?.ok && result.mockupSaved && result.choice) setDrafts(current => {
      const next = { ...current }; delete next[result.choice!]; return next;
    });
  }, [save.data]);
  const uploadPng = (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.set("intent", "uploadMockup"); form.set("choice", choice); form.set("file", file);
    upload.submit(form, { method: "post", encType: "multipart/form-data", action: "/app/acrylic-prices" });
  };
  const saveMockup = () => {
    const form = new FormData();
    form.set("intent", "saveMockup"); form.set("choice", choice);
    form.set("template", JSON.stringify(template)); form.set("digest", digest || "");
    save.submit(form, { method: "post", action: "/app/acrylic-prices" });
  };
  return <s-section heading="Master mockups & test preview">
    <s-paragraph>Choose a size, upload its transparent PNG, test with a photo, then save. Test photos stay in this browser.</s-paragraph>
    <div className="cw-mockup-editor">
      <div className="cw-mockup-controls">
        <div className="cw-mockup-choices">
          <label>Size<select value={size} disabled={busy} onChange={e => setSize(e.currentTarget.value)}>{sizes.map(value => <option key={value} value={value}>{value} inches</option>)}</select></label>
          <label>Thickness<select value={thickness} disabled={busy} onChange={e => setThickness(e.currentTarget.value)}><option value="3mm">3mm without studs</option><option value="5mm">5mm with studs</option></select></label>
          <label>Orientation<select value={direction} disabled={busy} onChange={e => setDirection(e.currentTarget.value)}><option>Portrait</option><option>Landscape</option></select></label>
        </div>
        <div className="cw-mockup-file">
          <strong>{template ? template.mockupName : "Automatic wall preview"}</strong>
          <span>{dirty ? "Unsaved change" : template ? "Current master PNG" : "No separate PNG needed for this size"}</span>
          {template && <a href={template.mockup} target="_blank" rel="noreferrer">Open master PNG</a>}
        </div>
        <label>Upload / replace master mockup PNG<input ref={fileInput} type="file" accept="image/png,.png" disabled={busy} onChange={e => { uploadPng(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label>
        <p className="cw-mockup-help">Keep one rectangular photo area transparent. Match the selected size and orientation. Up to 20 MB.</p>
        {upload.state !== "idle" && <p role="status">Checking and uploading PNG…</p>}
        {upload.data?.message && <p role={upload.data.ok ? "status" : "alert"}>{upload.data.message}</p>}
        <label>Test photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
          const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (!file) return;
          if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) { setPhotoError("Choose a JPG, PNG or WebP photo smaller than 20 MB."); return; }
          setPhotoError(""); setPhoto(URL.createObjectURL(file)); setZoom(1);
        }} /></label>
        {photoError && <p role="alert">{photoError}</p>}
        {photo && <><label>Test photo zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(Number(e.currentTarget.value))} /></label><button type="button" onClick={() => { setPhoto(""); setZoom(1); }}>Remove test photo</button></>}
        <div className="cw-mockup-actions">
          <button className="cw-mockup-save" type="button" disabled={busy || !dirty} onClick={saveMockup}>{save.state !== "idle" ? "Saving…" : "Save selected mockup"}</button>
          <button type="button" disabled={busy || !template} onClick={() => setDrafts(current => ({ ...current, [choice]: null }))}>Use automatic preview</button>
          {dirty && <button type="button" disabled={busy} onClick={() => setDrafts(current => { const next = { ...current }; delete next[choice]; return next; })}>Discard change</button>}
        </div>
        {save.data?.message && <p role={save.data.ok ? "status" : "alert"}>{save.data.message}</p>}
      </div>
      <div className="cw-mockup-output">
        <div className="cw-mockup-stage" style={{ aspectRatio: template?.mockupAspect || 1, backgroundImage: template ? undefined : 'url("/acrylic-preview-room.jpg")' }}>
          <div className={`cw-mockup-photo ${!template && thickness === "5mm" ? "cw-mockup-photo--studs" : ""}`} style={{ left: `${template?.x ?? 50}%`, top: `${template?.y ?? 34}%`, width: `${template?.width ?? dimensions.width / 60 * 78}%`, height: `${template?.height ?? dimensions.height / 60 * 78}%` }}>
            {photo ? <img src={photo} alt="Your test photo" style={{ transform: `scale(${zoom})` }} onError={() => setPhotoError("This photo could not be opened. Try another JPG or PNG.")} /> : <span>Test photo</span>}
          </div>
          {template && <img className="cw-mockup-overlay" src={template.mockup} alt="Selected master mockup" />}
        </div>
        <p><strong>{dimensions.width}″ wide × {dimensions.height}″ high · {thickness} · {direction}</strong></p>
        <p className="cw-mockup-help">Test preview only. Your test photo is not saved to the product or used for customer orders.</p>
      </div>
    </div>
  </s-section>;
}
