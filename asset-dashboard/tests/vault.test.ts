import assert from "node:assert/strict";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import {
  createVaultSession, encryptedFilename, ITERATIONS, MAX_CONFIG_BYTES, MAX_VAULT_BYTES,
  openPortfolio, parseConfig, parseVault, persistVault, sealPortfolio, VAULT_STORAGE_KEY,
} from "../lib/client/vault";
import type { PortfolioConfig } from "../lib/valuation/types";

const password = "test-only password: 密码 🗝️";
const config: PortfolioConfig = { baseCurrency: "USD", assets: [{ id: "paper", name: "纸黄金", type: "gold", quantity: 5, unit: "gram" }] };

test("vault round trip preserves Unicode and gold quantity without plaintext fields", async () => {
  const session = await createVaultSession(password);
  assert.equal(session.key.extractable, false);
  const text = await sealPortfolio(config, session);
  assert.ok(!text.includes("纸黄金"));
  assert.ok(!text.includes('"assets"'));
  assert.deepEqual((await openPortfolio(text, password)).config, config);
  // Independent Node/OpenSSL decryption checks the portable format and AAD contract.
  const envelope = parseVault(text);
  const { ciphertext, ...metadata } = envelope;
  const key = pbkdf2Sync(password, Buffer.from(envelope.kdf.salt, "base64"), ITERATIONS, 32, "sha256");
  const bytes = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.cipher.iv, "base64"));
  decipher.setAAD(Buffer.from(JSON.stringify(metadata)));
  decipher.setAuthTag(bytes.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
  assert.deepEqual(JSON.parse(plaintext.toString("utf8")), config);
});

test("each save changes IV and ciphertext; each new password session changes salt", async () => {
  const session = await createVaultSession(password);
  const a = parseVault(await sealPortfolio(config, session));
  const b = parseVault(await sealPortfolio(config, session));
  const other = await createVaultSession(password);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(session.salt, other.salt);
});

test("wrong password, modified ciphertext, salt, IV and tag are rejected", async () => {
  const original = await sealPortfolio(config, await createVaultSession(password));
  await assert.rejects(openPortfolio(original, "incorrect password"), /Incorrect password or damaged/);
  for (const target of ["ciphertext", "tag", "salt", "iv"]) {
    const value = parseVault(original);
    const encoded = target === "salt" ? value.kdf.salt : target === "iv" ? value.cipher.iv : value.ciphertext;
    const bytes = Buffer.from(encoded, "base64");
    bytes[target === "tag" ? bytes.length - 1 : 0] ^= 1;
    if (target === "salt") value.kdf.salt = bytes.toString("base64");
    else if (target === "iv") value.cipher.iv = bytes.toString("base64");
    else value.ciphertext = bytes.toString("base64");
    await assert.rejects(openPortfolio(JSON.stringify(value), password), /Incorrect password or damaged/);
  }
});

test("password rotation revokes the old password for the new file", async () => {
  const old = await sealPortfolio(config, await createVaultSession(password));
  const { config: restored } = await openPortfolio(old, password);
  const next = await sealPortfolio(restored, await createVaultSession("replacement password"));
  await assert.rejects(openPortfolio(next, password), /Incorrect password/);
  assert.deepEqual((await openPortfolio(next, "replacement password")).config, config);
  assert.deepEqual((await openPortfolio(old, password)).config, config); // Historical backups are independent.
});

test("unsupported versions, suites, costs, fields and invalid encodings fail before decryption", async () => {
  const original = JSON.parse(await sealPortfolio(config, await createVaultSession(password)));
  for (const mutate of [
    (v: typeof original) => { v.version = 2; },
    (v: typeof original) => { v.kdf.iterations = 1; },
    (v: typeof original) => { v.kdf.iterations = 1e12; },
    (v: typeof original) => { v.kdf.hash = "SHA-1"; },
    (v: typeof original) => { v.cipher.name = "AES-CBC"; },
    (v: typeof original) => { v.cipher.tagLength = 32; },
    (v: typeof original) => { v.extra = "ignored?"; },
    (v: typeof original) => { v.cipher.iv = "AA=="; },
    (v: typeof original) => { v.kdf.salt = "?"; },
    (v: typeof original) => { v.ciphertext = ""; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => parseVault(JSON.stringify(changed)));
  }
  assert.throws(() => parseVault(" ".repeat(MAX_VAULT_BYTES + 1)), /360 KiB/);
  assert.throws(() => parseVault(JSON.stringify(config)), /Unsupported/);
  assert.throws(() => parseConfig(" ".repeat(MAX_CONFIG_BYTES + 1)), /256 KiB/);
});

test("password validation, plaintext migration validation and encrypted names", async () => {
  await assert.rejects(createVaultSession("short"), /at least 12/);
  await assert.rejects(createVaultSession(" ".repeat(12)), /at least 12/);
  await assert.rejects(createVaultSession("a".repeat(1025)), /1024/);
  assert.deepEqual(parseConfig(JSON.stringify(config)), config);
  assert.throws(() => parseConfig('{"assets":[{"type":"gold","quantity":-1}]}'));
  assert.equal(encryptedFilename("example.json"), "example.vault.json");
  assert.equal(encryptedFilename("example.vault.json"), "example.vault.json");
});

test("persistence only accepts ciphertext and reports write failures without silent loss", async () => {
  const saved = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => { saved.set(key, value); } };
  assert.throws(() => persistVault(storage, JSON.stringify(config)));
  assert.equal(saved.size, 0);
  const text = await sealPortfolio(config, await createVaultSession(password));
  persistVault(storage, text);
  assert.equal(saved.get(VAULT_STORAGE_KEY), text);
  assert.throws(() => persistVault({ setItem: () => { throw new Error("quota"); } }, text), /previous portfolio is unchanged/);
});

test("the shipped example is encrypted and the plaintext public file is removed", () => {
  const text = readFileSync(new URL("../public/example.vault.json", import.meta.url), "utf8");
  assert.equal(parseVault(text).format, "asset-dashboard-vault");
  assert.ok(!text.includes("quantity"));
  assert.equal(existsSync(new URL("../public/sample-config.json", import.meta.url)), false);
});
