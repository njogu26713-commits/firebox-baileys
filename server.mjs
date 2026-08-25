import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import pino from "pino";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
} from "./lib/index.js";

const PORT = Number(process.env.PORT || 3000);
const BOT_KEY = String(process.env.FIREBOX_BOT_KEY || "");
const HUB_URL = String(process.env.FIREBOX_HUB_URL || "").replace(/\/$/, "");
const BOT_ID = String(process.env.FIREBOX_BOT_ID || "");
const BOT_NAME = process.env.FIREBOX_BOT_NAME || BOT_ID || "Firebox Bot";
const WORKSPACE_URL = process.env.FIREBOX_PUBLIC_URL || process.env.PUBLIC_URL || "";
const AUTH_DIR = process.env.FIREBOX_AUTH_DIR || "./auth_info";
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const runtime = {
  socket: null,
  status: "offline",
  phone: null,
  pairingCode: null,
  pairingPromise: null,
  pairingRequested: false,
  lastError: null,
  connectedAt: null,
  startedAt: new Date().toISOString(),
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function authorized(req) {
  if (!BOT_KEY) return true;
  return req.headers["x-firebox-panel-key"] === BOT_KEY;
}

async function hubRequest(path, options = {}) {
  if (!HUB_URL || !BOT_ID || !BOT_KEY) return null;
  const response = await fetch(`${HUB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Firebox-Bot-Id": BOT_ID,
      "X-Firebox-Bot-Key": BOT_KEY,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Hub returned HTTP ${response.status}`);
  return body;
}

async function sendEvent(type, data = {}) {
  if (!HUB_URL || !BOT_ID || !BOT_KEY) return;
  try {
    await hubRequest(`/api/ingest/${encodeURIComponent(BOT_ID)}`, {
      method: "POST",
      headers: { "X-Firebox-Event-Id": randomUUID() },
      body: JSON.stringify({ type, data }),
    });
  } catch (error) {
    logger.warn({ err: error }, "Firebox Hub event failed");
  }
}

function normalizePhone(value) {
  const phone = String(value || "").replace(/[^0-9]/g, "");
  if (phone.length < 8 || phone.length > 15) throw new Error("Enter a valid WhatsApp phone number with country code.");
  return phone;
}

function resolvePairing(code) {
  const pending = runtime.pairingPromise;
  runtime.pairingPromise = null;
  runtime.pairingCode = code;
  pending?.resolve(code);
}

function rejectPairing(error) {
  const pending = runtime.pairingPromise;
  runtime.pairingPromise = null;
  runtime.pairingCode = null;
  pending?.reject(error);
}

async function requestPairingWhenReady(socket) {
  if (runtime.pairingRequested || runtime.pairingCode || !runtime.phone) return;
  runtime.pairingRequested = true;
  try {
    await socket.waitForSocketOpen();
    if (runtime.socket !== socket || !runtime.pairingPromise) return;
    const code = await socket.requestPairingCode(runtime.phone);
    resolvePairing(code);
    await sendEvent("bot.pairing_code", { phone: runtime.phone, code });
  } catch (error) {
    runtime.lastError = error.message;
    rejectPairing(error);
  } finally {
    runtime.pairingRequested = false;
  }
}

async function startSocket() {
  if (runtime.socket) return runtime.socket;
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const socket = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  runtime.socket = socket;
  runtime.status = "connecting";
  runtime.lastError = null;
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      runtime.status = "online";
      runtime.connectedAt = new Date().toISOString();
      await sendEvent("bot.status", { status: "online" });
    }
    if (connection === "close") {
      runtime.status = "offline";
      runtime.socket = null;
      runtime.pairingRequested = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      runtime.lastError = code ? `WhatsApp disconnected with status ${code}.` : "WhatsApp connection closed.";
      await sendEvent("bot.status", { status: "offline", reason: runtime.lastError });
      if (code === DisconnectReason.loggedOut) runtime.pairingCode = null;
    }
  });
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    await sendEvent("message.received", {
      type,
      count: Array.isArray(messages) ? messages.length : 0,
      connected: runtime.status === "online",
    });
  });
  return socket;
}

async function getPairingCode(phone) {
  runtime.phone = normalizePhone(phone);
  if (runtime.pairingCode && runtime.status !== "online") return runtime.pairingCode;
  if (runtime.pairingPromise) return runtime.pairingPromise.promise;
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  runtime.pairingPromise = { promise, resolve, reject };
  const timeout = setTimeout(() => rejectPairing(new Error("Timed out waiting for WhatsApp pairing. Try again.")), 30000);
  try {
    const socket = await startSocket();
    void requestPairingWhenReady(socket);
    if (runtime.pairingCode) {
      clearTimeout(timeout);
      runtime.pairingPromise = null;
      return runtime.pairingCode;
    }
  } catch (error) {
    clearTimeout(timeout);
    rejectPairing(error);
    throw error;
  }
  try {
    const code = await promise;
    clearTimeout(timeout);
    return code;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "firebox-baileys", status: runtime.status, uptime: Math.round(process.uptime()) });
  }
  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, { service: "firebox-baileys", status: runtime.status, endpoints: ["/health", "/api/bot/status", "/api/bot/pair-code"] });
  }
  if (!authorized(req)) return json(res, 401, { error: "Invalid Firebox panel key." });
  if (req.method === "GET" && url.pathname === "/api/bot/status") {
    return json(res, 200, {
      ok: true,
      status: runtime.status,
      connected: runtime.status === "online",
      phone: runtime.phone,
      botId: BOT_ID || null,
      botName: BOT_NAME,
      lastError: runtime.lastError,
      connectedAt: runtime.connectedAt,
      startedAt: runtime.startedAt,
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bot/pair-code") {
    try {
      const body = await readJson(req);
      const code = await getPairingCode(body.phone);
      return json(res, 200, { ok: true, code, phone: runtime.phone, status: runtime.status });
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message });
    }
  }
  return json(res, 404, { error: "Not found." });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    logger.error({ err: error }, "Unhandled HTTP request error");
    json(res, 500, { error: "Internal server error." });
  });
});

server.listen(PORT, "0.0.0.0", async () => {
  logger.info({ port: PORT, botId: BOT_ID || undefined }, "Firebox Baileys service listening");
  if (HUB_URL && BOT_ID && BOT_KEY) {
    try {
      await hubRequest("/api/register", { method: "POST", body: JSON.stringify({ name: BOT_NAME, workspaceUrl: WORKSPACE_URL }) });
      await sendEvent("bot.status", { status: "service_online" });
    } catch (error) {
      logger.warn({ err: error }, "Firebox Hub registration failed");
    }
  }
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
