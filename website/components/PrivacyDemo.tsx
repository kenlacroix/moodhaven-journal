"use client";
import { useState } from "react";

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(text: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );
  const combined = new Uint8Array(salt.length + iv.length + ct.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ct), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(cipherB64: string, password: string): Promise<string> {
  const bytes = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ct = bytes.slice(28);
  const key = await deriveKey(password, salt);
  const dec = new TextDecoder();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(plain);
}

const DEMO_ENTRY =
  "Today I felt grateful for the quiet morning. The coffee was perfect and I finished three chapters. Mood: content.";
const DEMO_PASSWORD = "my-journal-password";

type Step = "idle" | "encrypting" | "encrypted" | "decrypting" | "decrypted" | "error";

export default function PrivacyDemo() {
  const [step, setStep] = useState<Step>("idle");
  const [ciphertext, setCiphertext] = useState("");
  const [error, setError] = useState("");

  const handleEncrypt = async () => {
    setStep("encrypting");
    try {
      const ct = await encryptText(DEMO_ENTRY, DEMO_PASSWORD);
      setCiphertext(ct);
      setStep("encrypted");
    } catch (e) {
      setError(String(e));
      setStep("error");
    }
  };

  const handleDecrypt = async () => {
    setStep("decrypting");
    try {
      await decryptText(ciphertext, DEMO_PASSWORD);
      setStep("decrypted");
    } catch (e) {
      setError(String(e));
      setStep("error");
    }
  };

  const reset = () => {
    setStep("idle");
    setCiphertext("");
    setError("");
  };

  return (
    <div className="bg-primary-950 rounded-xl p-6 ring-1 ring-primary-800 h-full flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">
          Try it: Encrypt in your browser
        </h3>
        <p className="text-xs text-primary-400">
          AES-256-GCM via WebCrypto API — no server, no network call.
        </p>
      </div>

      {/* Journal entry */}
      <div className="bg-primary-900/50 rounded-lg p-3 text-xs text-primary-200 font-mono leading-relaxed border border-primary-800">
        <span className="text-primary-500 block mb-1 text-[10px] uppercase tracking-wider">
          Journal entry (plaintext)
        </span>
        {DEMO_ENTRY}
      </div>

      {/* Ciphertext output */}
      {ciphertext && (
        <div className="bg-black/40 rounded-lg p-3 text-xs text-emerald-400 font-mono leading-relaxed break-all border border-emerald-900/50 max-h-24 overflow-y-auto">
          <span className="text-emerald-600 block mb-1 text-[10px] uppercase tracking-wider">
            AES-256-GCM ciphertext (what MoodHaven stores)
          </span>
          {ciphertext}
        </div>
      )}

      {step === "decrypted" && (
        <div className="bg-primary-900/50 rounded-lg p-3 text-xs text-primary-200 font-mono leading-relaxed border border-primary-800">
          <span className="text-primary-500 block mb-1 text-[10px] uppercase tracking-wider">
            Decrypted with same password ✓
          </span>
          {DEMO_ENTRY}
        </div>
      )}

      {step === "error" && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2 flex-wrap items-center">
        {step === "idle" && (
          <button
            onClick={handleEncrypt}
            className="text-xs font-semibold px-4 py-2 rounded-full bg-accent-cta text-neutral-900 hover:bg-accent-cta/90 transition-colors"
          >
            Encrypt →
          </button>
        )}
        {step === "encrypting" && (
          <span className="text-xs text-primary-400 animate-pulse">Encrypting…</span>
        )}
        {step === "encrypted" && (
          <>
            <button
              onClick={handleDecrypt}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-white text-primary-900 hover:bg-primary-100 transition-colors"
            >
              Decrypt →
            </button>
            <span className="text-[10px] text-primary-600 font-mono">
              ↑ this is all MoodHaven ever stores
            </span>
          </>
        )}
        {step === "decrypting" && (
          <span className="text-xs text-primary-400 animate-pulse">Decrypting…</span>
        )}
        {(step === "decrypted" || step === "error") && (
          <button
            onClick={reset}
            className="text-xs font-medium px-4 py-2 rounded-full ring-1 ring-primary-700 text-primary-300 hover:ring-primary-500 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
