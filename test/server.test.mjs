import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3900 + Math.floor(Math.random() * 500);
let child;

async function request(path, options = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

before(async () => {
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), FIREBOX_BOT_KEY: "test-key", FIREBOX_AUTH_DIR: `/tmp/firebox-baileys-test-${port}` },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await request("/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("service did not start");
});

after(() => child?.kill("SIGTERM"));

test("health endpoint is public and identifies the service", async () => {
  const response = await request("/health");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "firebox-baileys");
});

test("status endpoint rejects a missing panel key", async () => {
  const response = await request("/api/bot/status");
  assert.equal(response.status, 401);
});

test("status endpoint accepts the configured panel key", async () => {
  const response = await request("/api/bot/status", { headers: { "X-Firebox-Panel-Key": "test-key" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "offline");
});

test("pair-code endpoint validates phone input before connecting", async () => {
  const response = await request("/api/bot/pair-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Firebox-Panel-Key": "test-key" },
    body: JSON.stringify({ phone: "12" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /valid WhatsApp phone/i);
});
