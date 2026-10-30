"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FolderOpen, KeyRound, Loader2, LockKeyhole, Plus } from "lucide-react";
import type { PortfolioConfig } from "@/lib/valuation/types";
import {
  createVaultSession, downloadVault, encryptedFilename, MAX_VAULT_BYTES,
  openPortfolio, parseConfig, parseVault, persistVault, sealPortfolio,
  VAULT_STORAGE_KEY, type VaultSession,
} from "@/lib/client/vault";
import { Dialog } from "./Dialog";
import { NetWorthDashboard } from "./NetWorthDashboard";

type FileState = { text: string; name: string };
type Unlocked = FileState & { config: PortfolioConfig; session: VaultSession; id: number };
type Action = { kind: "unlock"; file: FileState } | { kind: "create"; config: PortfolioConfig; name: string } | { kind: "password" };
const message = (reason: unknown) => reason instanceof Error ? reason.message : "Could not open or save the encrypted file.";

export function PortfolioWorkspace() {
  const [file, setFile] = useState<FileState | null>(null);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(true);

  const lock = useCallback(() => {
    sequence.current++;
    operation.current = false;
    setUnlocked(null);
    setAction(null);
    setPassword("");
    setConfirmation("");
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const ticket = sequence.current;
    async function initialize() {
      try {
        const saved = localStorage.getItem(VAULT_STORAGE_KEY);
        let text = saved;
        if (text === null) {
          const response = await fetch("/example.vault.json", { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Could not load the encrypted example. Open a file or create a portfolio.");
          text = await response.text();
        }
        parseVault(text);
        if (!controller.signal.aborted && ticket === sequence.current)
          setFile({ text, name: saved === null ? "example.vault.json" : "portfolio.vault.json" });
      } catch (reason) {
        if (!controller.signal.aborted && ticket === sequence.current) setError(message(reason));
      } finally {
        if (!controller.signal.aborted) setStarting(false);
      }
    }
    const timer = window.setTimeout(() => {
      controller.abort();
      if (ticket === sequence.current) {
        setStarting(false);
        setError("The encrypted example request timed out. Open a file or create a portfolio.");
      }
    }, 10_000);
    void initialize().finally(() => window.clearTimeout(timer));
    function syncStorage(event: StorageEvent) {
      if (event.storageArea !== localStorage || (event.key !== VAULT_STORAGE_KEY && event.key !== null)) return;
      lock();
      setStarting(false);
      try {
        if (event.newValue) parseVault(event.newValue);
        setFile(event.newValue ? { text: event.newValue, name: "portfolio.vault.json" } : null);
      } catch (reason) { setFile(null); setError(message(reason)); }
    }
    window.addEventListener("pagehide", lock);
    window.addEventListener("storage", syncStorage);
    return () => {
      mounted.current = false;
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", lock);
      window.removeEventListener("storage", syncStorage);
    };
  }, [lock]);

  function begin(next: Action) {
    if (operation.current) return;
    sequence.current++;
    setStarting(false);
    setPassword("");
    setConfirmation("");
    setError(null);
    setAction(next);
  }

  async function importFile(selected?: File) {
    if (!selected || operation.current) return;
    const ticket = ++sequence.current;
    setStarting(false);
    setError(null);
    try {
      if (selected.size > MAX_VAULT_BYTES) throw new Error("Files must be 360 KiB or smaller.");
      const text = await selected.text();
      if (!mounted.current || ticket !== sequence.current) return;
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "format" in parsed) {
        parseVault(text);
        begin({ kind: "unlock", file: { text, name: encryptedFilename(selected.name) } });
      } else {
        // One-way migration: plaintext can be read, but is never persisted or downloaded.
        begin({ kind: "create", config: parseConfig(text), name: encryptedFilename(selected.name) });
      }
    } catch (reason) {
      if (ticket === sequence.current) setError(message(reason));
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || operation.current) return;
    const selectedAction = action;
    const ticket = ++sequence.current;
    operation.current = true;
    setBusy(true);
    setError(null);
    try {
      let config: PortfolioConfig;
      let session: VaultSession;
      let name: string;
      if (selectedAction.kind === "unlock") {
        ({ config, session } = await openPortfolio(selectedAction.file.text, password));
        name = selectedAction.file.name;
      } else {
        if (password !== confirmation) throw new Error("Passwords do not match.");
        session = await createVaultSession(password);
        config = selectedAction.kind === "create" ? selectedAction.config : unlocked!.config;
        name = selectedAction.kind === "create" ? selectedAction.name : unlocked!.name;
      }
      const text = await sealPortfolio(config, session);
      if (!mounted.current || ticket !== sequence.current) return;
      // Commit ciphertext first; a quota/privacy-mode error must not replace the old session.
      persistVault(localStorage, text);
      setFile({ text, name });
      setUnlocked({ config, session, text, name, id: ticket });
      setAction(null);
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      if (ticket === sequence.current) setError(message(reason));
    } finally {
      if (ticket === sequence.current) { operation.current = false; setBusy(false); }
    }
  }

  async function save(config: PortfolioConfig) {
    if (!unlocked || operation.current) throw new Error("The portfolio is locked or busy. Try again.");
    const ticket = ++sequence.current;
    operation.current = true;
    setBusy(true);
    try {
      const text = await sealPortfolio(config, unlocked.session);
      if (!mounted.current || ticket !== sequence.current) throw new Error("The portfolio was locked before saving.");
      persistVault(localStorage, text);
      setFile({ text, name: unlocked.name });
      setUnlocked({ ...unlocked, config, text });
    } finally {
      if (ticket === sequence.current) { operation.current = false; setBusy(false); }
    }
  }

  return <>
    <input ref={fileRef} type="file" accept="application/json,.json,.vault" className="sr-only" aria-label="Open encrypted portfolio or migrate JSON" onChange={(event) => void importFile(event.target.files?.[0])} />
    {unlocked ? <NetWorthDashboard
      key={unlocked.id}
      loaded={{ config: unlocked.config, text: JSON.stringify(unlocked.config, null, 2), name: unlocked.name }}
      saving={busy}
      onSave={save}
      onImport={() => fileRef.current?.click()}
      onDownload={() => downloadVault(unlocked.text, unlocked.name)}
      onLock={lock}
      onPassword={() => begin({ kind: "password" })}
    /> : <main className="vault-gate" aria-label="Encrypted portfolio">
      <LockKeyhole size={30} aria-hidden="true" />
      <span className="portfolio-name">{file?.name ?? "Portfolio locked"}</span>
      {starting ? <Loader2 className="spin" aria-label="Loading encrypted file" /> : <div className="vault-actions">
        <button className="button button-primary" disabled={!file || busy} onClick={() => file && begin({ kind: "unlock", file })}><KeyRound size={16} />Unlock</button>
        {file && <button className="button button-secondary" onClick={() => downloadVault(file.text, file.name)}>Download encrypted file</button>}
        <button className="button button-secondary" onClick={() => fileRef.current?.click()}><FolderOpen size={16} />Open file</button>
        <button className="button button-secondary" onClick={() => begin({ kind: "create", config: { baseCurrency: "USD", assets: [] }, name: "portfolio.vault.json" })}><Plus size={16} />New portfolio</button>
      </div>}
    </main>}
    {error && !action && <div className="notice notice-error vault-error" role="alert">{error}</div>}
    {action && <Dialog title={action.kind === "unlock" ? "Unlock portfolio" : "Set file password"} onClose={() => {
      if (operation.current) return;
      sequence.current++;
      setAction(null); setPassword(""); setConfirmation(""); setError(null);
    }}>
      <form className="vault-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="vault-password">{action.kind === "unlock" ? "File password" : "New file password"}</label>
        <input id="vault-password" type="password" autoComplete={action.kind === "unlock" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} maxLength={1024} />
        {action.kind !== "unlock" && <>
          <label htmlFor="vault-confirmation">Confirm password</label>
          <input id="vault-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} maxLength={1024} />
          <p className="muted">At least 12 characters. A lost password cannot be recovered. Download a new encrypted backup after changing it.</p>
        </>}
        {error && <p className="text-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="submit" className="button button-primary" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <LockKeyhole size={16} />}
          {action.kind === "unlock" ? "Unlock" : action.kind === "create" ? "Encrypt and open" : "Change password"}
        </button></div>
      </form>
    </Dialog>}
  </>;
}
