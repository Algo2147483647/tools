import { validatePortfolioConfig } from "../valuation/schema";
import type { PortfolioConfig } from "../valuation/types";

export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_VAULT_BYTES = 360 * 1024;
export const VAULT_STORAGE_KEY = "asset-dashboard.vault.v1";
export const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const format = "asset-dashboard-vault";

export type VaultSession = { key: CryptoKey; salt: string };
type Header = {
  format: typeof format;
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string; tagLength: 128 };
};
export type VaultEnvelope = Header & { ciphertext: string };

function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error("Encryption requires HTTPS or localhost in a browser with Web Crypto support.");
  return globalThis.crypto;
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function unbase64(value: unknown, length?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error("Invalid encrypted file encoding.");
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (base64(bytes) !== value || (length !== undefined && bytes.length !== length))
    throw new Error("Invalid encrypted file encoding.");
  return bytes;
}
function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.sort().join(",");
}
function header(salt: string, iv: string): Header {
  return { format, version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt }, cipher: { name: "AES-GCM", iv, tagLength: 128 } };
}

// Validate all untrusted parameters before expensive KDF work. Version 1 has one
// fixed suite; algorithm negotiation and attacker-controlled work factors are forbidden.
export function parseVault(text: string): VaultEnvelope {
  if (text.length > MAX_VAULT_BYTES || encoder.encode(text).length > MAX_VAULT_BYTES)
    throw new Error("Encrypted files must be 360 KiB or smaller.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Invalid encrypted file JSON."); }
  if (!exactKeys(value, ["format", "version", "kdf", "cipher", "ciphertext"]) || value.format !== format || value.version !== 1 ||
      !exactKeys(value.kdf, ["name", "hash", "iterations", "salt"]) || value.kdf.name !== "PBKDF2" || value.kdf.hash !== "SHA-256" || value.kdf.iterations !== ITERATIONS ||
      !exactKeys(value.cipher, ["name", "iv", "tagLength"]) || value.cipher.name !== "AES-GCM" || value.cipher.tagLength !== 128)
    throw new Error("Unsupported or damaged encrypted file.");
  unbase64(value.kdf.salt, 16);
  unbase64(value.cipher.iv, 12);
  const ciphertext = unbase64(value.ciphertext);
  if (ciphertext.length < 17 || ciphertext.length > MAX_CONFIG_BYTES + 16)
    throw new Error("Invalid encrypted file size.");
  return { ...header(value.kdf.salt as string, value.cipher.iv as string), ciphertext: value.ciphertext as string };
}

export function parseConfig(text: string): PortfolioConfig {
  if (encoder.encode(text).length > MAX_CONFIG_BYTES)
    throw new Error("The configuration must be 256 KiB or smaller.");
  return validatePortfolioConfig(JSON.parse(text));
}

async function deriveSession(password: string, salt: string): Promise<VaultSession> {
  if (!password || encoder.encode(password).length > 1024)
    throw new Error("Enter a password of at most 1024 UTF-8 bytes.");
  const api = cryptoApi();
  const passwordBytes = encoder.encode(password);
  try {
    const material = await api.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
    const key = await api.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: unbase64(salt, 16) },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
    return { key, salt };
  } finally { passwordBytes.fill(0); }
}

export async function createVaultSession(password: string): Promise<VaultSession> {
  if (Array.from(password).length < 12 || !password.trim())
    throw new Error("Use a password with at least 12 characters.");
  return deriveSession(password, base64(cryptoApi().getRandomValues(new Uint8Array(16))));
}

export async function sealPortfolio(config: PortfolioConfig, session: VaultSession): Promise<string> {
  const plaintext = encoder.encode(JSON.stringify(validatePortfolioConfig(config)));
  if (plaintext.length > MAX_CONFIG_BYTES) throw new Error("The configuration must be 256 KiB or smaller.");
  const metadata = header(session.salt, base64(cryptoApi().getRandomValues(new Uint8Array(12))));
  try {
    const ciphertext = await cryptoApi().subtle.encrypt(
      { name: "AES-GCM", iv: unbase64(metadata.cipher.iv, 12), tagLength: 128, additionalData: encoder.encode(JSON.stringify(metadata)) },
      session.key, plaintext,
    );
    return JSON.stringify({ ...metadata, ciphertext: base64(new Uint8Array(ciphertext)) }, null, 2);
  } finally { plaintext.fill(0); }
}

export async function openPortfolio(text: string, password: string): Promise<{ config: PortfolioConfig; session: VaultSession }> {
  const envelope = parseVault(text);
  const session = await deriveSession(password, envelope.kdf.salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: unbase64(envelope.cipher.iv, 12), tagLength: 128, additionalData: encoder.encode(JSON.stringify(header(envelope.kdf.salt, envelope.cipher.iv))) },
      session.key, unbase64(envelope.ciphertext),
    );
  } catch { throw new Error("Incorrect password or damaged encrypted file."); }
  try { return { config: parseConfig(decoder.decode(plaintext)), session }; }
  finally { new Uint8Array(plaintext).fill(0); }
}

export function encryptedFilename(name: string): string {
  return `${name.replace(/(?:\.vault)?\.json$/i, "").replace(/\.vault$/i, "") || "portfolio"}.vault.json`;
}

export function persistVault(storage: Pick<Storage, "setItem">, text: string): void {
  parseVault(text);
  try { storage.setItem(VAULT_STORAGE_KEY, text); }
  catch { throw new Error("Encrypted changes could not be saved in this browser. Allow site storage or free space, then retry. Your previous portfolio is unchanged."); }
}

export function downloadVault(text: string, name: string) {
  parseVault(text);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = encryptedFilename(name);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
