/**
 * Candado biométrico (Face ID / Touch ID) para la PWA.
 *
 * Es un CANDADO LOCAL de privacidad: no reemplaza el login de Supabase (la sesión
 * sigue siendo la autenticación real). Usa WebAuthn con un autenticador de
 * plataforma; la verificación la hace el sistema operativo (Face ID) y acá solo
 * chequeamos que la promesa resuelva OK. No hay verificación de firma en servidor
 * porque no es una barrera de seguridad remota, sino un lock de la app en el device.
 */

const LS_ENABLED = "faceid_enabled";
const LS_CRED = "faceid_cred_id";

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): ArrayBuffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function randBuf(n = 32): ArrayBuffer {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a.buffer;
}

export const biometric = {
  /** ¿El navegador soporta WebAuthn? */
  supported(): boolean {
    return typeof window !== "undefined"
      && !!window.PublicKeyCredential
      && !!navigator.credentials?.create;
  },

  /** ¿Hay un autenticador de plataforma (Face ID / Touch ID / huella)? */
  async platformAvailable(): Promise<boolean> {
    try {
      if (!biometric.supported()) return false;
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  isEnabled(): boolean {
    return localStorage.getItem(LS_ENABLED) === "1" && !!localStorage.getItem(LS_CRED);
  },

  /** Registra el candado (pide Face ID una vez para dar de alta la credencial). */
  async enable(email: string): Promise<void> {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randBuf(),
        rp: { name: "Gastos", id: location.hostname },
        user: { id: randBuf(16), name: email || "usuario", displayName: email || "Gastos" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!cred) throw new Error("No se pudo registrar Face ID");
    localStorage.setItem(LS_CRED, bufToB64url(cred.rawId));
    localStorage.setItem(LS_ENABLED, "1");
  },

  disable(): void {
    localStorage.removeItem(LS_ENABLED);
    localStorage.removeItem(LS_CRED);
  },

  /** Pide Face ID para desbloquear. Devuelve true si pasó la verificación. */
  async unlock(): Promise<boolean> {
    const id = localStorage.getItem(LS_CRED);
    if (!id) return true; // sin credencial = sin candado
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randBuf(),
          rpId: location.hostname,
          allowCredentials: [{ type: "public-key", id: b64urlToBuf(id), transports: ["internal"] }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      return !!assertion;
    } catch {
      return false;
    }
  },
};
