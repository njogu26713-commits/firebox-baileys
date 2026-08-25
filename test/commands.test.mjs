import test from "node:test";
import assert from "node:assert/strict";
import { handleCommand, parseCommand } from "../commands.mjs";

function mockSocket() {
  const sent = [];
  return { sent, sendMessage: async (...args) => { sent.push(args); return { key: { id: "test" } }; } };
}

test("parses dot-prefixed commands and aliases", () => {
  assert.deepEqual(parseCommand({ conversation: ".menu" }), { name: "menu", args: [], raw: "menu", text: ".menu" });
  assert.equal(parseCommand({ conversation: ".m" }).name, "menu");
  assert.equal(parseCommand({ conversation: "hello" }), null);
});

test("menu command replies with the standalone catalog", async () => {
  const sock = mockSocket();
  const handled = await handleCommand({ sock, jid: "123@s.whatsapp.net", message: { conversation: ".menu" }, status: "online" });
  assert.equal(handled, true);
  assert.match(sock.sent[0][1].text, /AI/);
  assert.match(sock.sent[0][1].text, /\.menu/);
  assert.match(sock.sent[0][1].text, /\.plugins/);
});

test("community command returns opt-in links", async () => {
  const sock = mockSocket();
  await handleCommand({ sock, jid: "123@s.whatsapp.net", message: { conversation: ".community" } });
  assert.match(sock.sent[0][1].text, /whatsapp\.com\/channel\/0029Vb8elJp77qVJlCeiNX26/);
  assert.match(sock.sent[0][1].text, /chat\.whatsapp\.com\/IXBsRfMhQh0GMdn8y5QfW5/);
  assert.match(sock.sent[0][1].text, /optional/i);
});

test("ping replies and ordinary messages are ignored", async () => {
  const sock = mockSocket();
  assert.equal(await handleCommand({ sock, jid: "123@s.whatsapp.net", message: { conversation: ".ping" } }), true);
  assert.equal(await handleCommand({ sock, jid: "123@s.whatsapp.net", message: { conversation: "hello" } }), false);
  assert.equal(sock.sent.length, 1);
});
