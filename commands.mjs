const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb8elJp77qVJlCeiNX26";
const GROUP_URL = "https://chat.whatsapp.com/IXBsRfMhQh0GMdn8y5QfW5?s=cl&p=a&ilr=4";

export const commandCatalog = {
  AI: ["ai", "ask", "imagine", "translate", "summarize"],
  "Automation / Presence": ["autotyping", "autorecording", "autoviewstatus", "autoread", "autoreact", "autoreply", "autostatus", "statusreact", "statusreply", "online", "offline", "antidelete", "antiedit", "autodownload", "autoreconnect", "autoping"],
  Group: ["groupinfo", "admins", "tagall", "hidetag", "add", "kick", "promote", "demote", "mute", "unmute", "antilink", "welcome", "goodbye"],
  Media: ["sticker", "toimg", "tourl", "audio", "video", "compress", "resize", "removebg"],
  Tools: ["ping", "alive", "info", "weather", "qr", "shortlink", "calc", "define"],
  Downloads: ["play", "song", "video", "ytmp3", "ytmp4", "tiktok", "instagram", "facebook"],
  User: ["profile", "id", "settings", "help", "menu", "owner"],
  "Owner / Admin": ["broadcast", "restart", "shutdown", "setprefix", "setbio", "setname", "block", "unblock", "ban", "unban"],
  Security: ["antispam", "antiflood", "antibot", "antitag", "antinsfw", "antilink"],
  "Bot Management": ["session", "sessions", "connect", "disconnect", "pair", "status", "logs", "settings", "plugins"]
};

const aliases = new Map([
  ["h", "help"], ["m", "menu"], ["p", "ping"], ["health", "status"],
  ["followchannel", "community"], ["joingroup", "community"], ["join", "community"]
]);

const allCommands = new Set(Object.values(commandCatalog).flat());

function menuText(prefix = ".") {
  return ["🤖 *Firebox Baileys*", "", ...Object.entries(commandCatalog).map(([category, commands]) =>
    `*${category}*\n${commands.map((command) => `${prefix}${command}`).join("  ")}`
  ), "", `Use ${prefix}help <command> for guidance.`, `Community links: ${prefix}community`].join("\n");
}

function normalizeText(message) {
  return message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption || message?.videoMessage?.caption || "";
}

export function parseCommand(message, prefix = ".") {
  const text = normalizeText(message).trim();
  if (!text.startsWith(prefix)) return null;
  const parts = text.slice(prefix.length).trim().split(/\s+/);
  const raw = (parts.shift() || "").toLowerCase();
  const name = aliases.get(raw) || raw;
  return { name, args: parts, raw, text };
}

export function isKnownCommand(name) {
  return allCommands.has(name) || aliases.has(name);
}

export async function handleCommand({ sock, jid, message, botName = "Firebox Baileys", prefix = ".", status = "offline" }) {
  const parsed = parseCommand(message, prefix);
  if (!parsed) return false;
  const { name, args } = parsed;
  let text;
  if (name === "menu" || name === "help" && !args[0]) text = menuText(prefix);
  else if (name === "ping") text = "🏓 Pong!";
  else if (name === "alive") text = `✅ ${botName} is online.\nStatus: ${status}`;
  else if (name === "status" || name === "info") text = `🤖 *${botName}*\nStatus: ${status}\nPrefix: ${prefix}`;
  else if (name === "id") text = `🆔 ${jid}`;
  else if (name === "owner") text = "👑 Contact the bot owner through the configured Firebox support channel.";
  else if (name === "profile") text = `👤 Your chat ID is:\n${jid}`;
  else if (name === "community") text = `🌐 *Firebox Community*\n\nFollow the official channel:\n${CHANNEL_URL}\n\nJoin the official group:\n${GROUP_URL}\n\nThese actions are optional. Open the link and confirm in WhatsApp if you choose to follow or join.`;
  else if (name === "pair" || name === "connect") text = "🔗 Use the Firebox panel to generate a pairing code for this bot. This chat command does not expose pairing credentials.";
  else if (name === "help") text = allCommands.has(args[0]?.toLowerCase()) ? `ℹ️ ${prefix}${args[0]} is available in the Firebox command catalog.` : menuText(prefix);
  else if (isKnownCommand(name)) text = `ℹ️ ${prefix}${name} is recognized by this standalone bot. Its feature handler is not enabled in this lightweight runtime yet.`;
  else return false;
  await sock.sendMessage(jid, { text }, { quoted: message });
  return true;
}
