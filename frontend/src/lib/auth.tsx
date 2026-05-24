import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type MfaStatus = "unenrolled" | "needs-verify" | "verified";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  mfaStatus: MfaStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  enrollTotp: () => Promise<{ factorId: string; qrCode: string; secret: string }>;
  verifyTotp: (factorId: string, code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Lee el AAL del token local — no hace red, no puede colgar */
async function getMfaStatusFromToken(): Promise<MfaStatus> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!data) return "unenrolled";
    if (data.currentLevel === "aal2") return "verified";
    if (data.nextLevel === "aal2") return "needs-verify";
    return "unenrolled";
  } catch {
    return "unenrolled";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>("unenrolled");

  useEffect(() => {
    // Timeout de seguridad: si getSession() cuelga, desbloqueamos igual
    const safetyTimer = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(safetyTimer);
      setSession(session);
      if (session) {
        // Sesión existente: verificar MFA desde el JWT (operación local)
        const status = await getMfaStatusFromToken();
        setMfaStatus(status);
      }
      setLoading(false);
    }).catch(() => {
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) setMfaStatus("unenrolled");
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // Chequear MFA justo después del login exitoso
    const status = await getMfaStatusFromToken();
    setMfaStatus(status);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMfaStatus("unenrolled");
  }

  async function enrollTotp() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Gastos",
      friendlyName: "Autenticador",
    });
    if (error || !data) throw new Error(error?.message ?? "Error al iniciar enrollment");
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }

  async function verifyTotp(factorId: string, code: string) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new Error(error.message);
    setMfaStatus("verified");
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, loading, mfaStatus,
      signIn, signOut, enrollTotp, verifyTotp,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
