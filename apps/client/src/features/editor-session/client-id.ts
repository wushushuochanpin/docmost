const CLIENT_ID_KEY = "docmost.editorSession.clientId";
const CHANNEL_NAME = "docmost.editorSession.clientId";

let currentClientId: string | null = null;
let clientIdChannel: BroadcastChannel | null = null;

function createClientId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const TAB_ID = createClientId();

export function getEditorSessionClientId(): string {
  if (currentClientId) {
    return currentClientId;
  }

  const stored = sessionStorage.getItem(CLIENT_ID_KEY);
  currentClientId = stored || createClientId();
  sessionStorage.setItem(CLIENT_ID_KEY, currentClientId);
  return currentClientId;
}

function setEditorSessionClientId(clientId: string) {
  currentClientId = clientId;
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);
}

export function startEditorSessionClientIdResponder() {
  if (!("BroadcastChannel" in window) || clientIdChannel) {
    return;
  }

  clientIdChannel = new BroadcastChannel(CHANNEL_NAME);
  clientIdChannel.onmessage = (event) => {
    const data = event.data;
    const clientId = getEditorSessionClientId();
    if (
      data?.type === "probe" &&
      data.clientId === clientId &&
      data.nonce &&
      data.tabId !== TAB_ID
    ) {
      clientIdChannel?.postMessage({ type: "duplicate", nonce: data.nonce });
    }
  };
}

export async function ensureUniqueEditorSessionClientId(): Promise<string> {
  if (!("BroadcastChannel" in window)) {
    return getEditorSessionClientId();
  }

  startEditorSessionClientIdResponder();

  let clientId = getEditorSessionClientId();
  const nonce = createClientId();
  let duplicated = false;

  const probeChannel = new BroadcastChannel(CHANNEL_NAME);
  probeChannel.onmessage = (event) => {
    const data = event.data;
    if (data?.type === "duplicate" && data.nonce === nonce) {
      duplicated = true;
    }
  };

  probeChannel.postMessage({ type: "probe", clientId, nonce, tabId: TAB_ID });
  await new Promise((resolve) => setTimeout(resolve, 80));
  probeChannel.close();

  if (duplicated) {
    clientId = createClientId();
    setEditorSessionClientId(clientId);
  }

  return clientId;
}

export function encodeEditSessionForUrl(editSession?: unknown): string | null {
  if (!editSession) return null;

  const json = JSON.stringify(editSession);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
