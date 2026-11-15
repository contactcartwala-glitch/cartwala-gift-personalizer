import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
const output = new URL("../.qa-cod-recovery-job/", import.meta.url);
await mkdir(output, { recursive: true });
const saved = process.env.COD_RECOVERY_JOB_TOKEN;
let calls = 0, fail = false;
globalThis.__codRecoveryJob = async () => { calls++; if (fail) throw new Error("private provider details");
  return { checked: 2, confirmed: 1, pending: 1, review: 0 }; };
try {
  await build({ entryPoints: ["app/routes/api.advance-cod-recovery.ts"], bundle: true, packages: "external",
    platform: "node", format: "esm", outfile: new URL("job.mjs", output).pathname,
    plugins: [{ name: "test-job", setup(builder) {
      builder.onResolve({ filter: /partial-cod-paytm-runtime\.server$/ }, () => ({ path: "runtime", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: "export const recoverConfiguredCodBatch = () => globalThis.__codRecoveryJob();" }));
    } }] });
  const { loader, action } = await import(new URL("job.mjs", output));
  const call = (authorization, method = "POST") => action({ request: new Request("https://example.test/api/advance-cod-recovery", {
    method, headers: authorization ? { authorization } : {} }) });
  assert.equal(loader().status, 405);
  assert.equal((await call("", "PUT")).status, 405);
  delete process.env.COD_RECOVERY_JOB_TOKEN;
  assert.equal((await call("Bearer ")).status, 401);
  process.env.COD_RECOVERY_JOB_TOKEN = "TEST_ONLY_RECOVERY_TOKEN_32_CHARACTERS";
  for (const value of ["", "Bearer wrong", `Bearer ${process.env.COD_RECOVERY_JOB_TOKEN.slice(1)}x`])
    assert.equal((await call(value)).status, 401);
  assert.equal(calls, 0);
  const result = await call(`Bearer ${process.env.COD_RECOVERY_JOB_TOKEN}`);
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { checked: 2, confirmed: 1, pending: 1, review: 0 });
  assert.equal(calls, 1);
  fail = true;
  const unavailable = await call(`Bearer ${process.env.COD_RECOVERY_JOB_TOKEN}`);
  assert.equal(unavailable.status, 503); assert.equal((await unavailable.text()).includes("private"), false);
  console.log("Recovery scheduler POST/authentication boundary, missing/wrong token rejection, bounded summary and sanitized provider errors passed.");
} finally {
  if (saved === undefined) delete process.env.COD_RECOVERY_JOB_TOKEN; else process.env.COD_RECOVERY_JOB_TOKEN = saved;
  delete globalThis.__codRecoveryJob; await rm(output, { recursive: true, force: true });
}
