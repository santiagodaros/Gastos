import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type MfaStatus = "loading" | "unenrolled" | "needs-verify" | "verified";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  mfaStatus: MfaStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  enrollTotp: () => Promise<{ factorId: string; qrCode: string; secret: string }>;
  verifyTotp: (factorId: string, code: string) => Promise<void>;
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function checkMfaStatus(): Promise<MfaStatus> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "unenrolled";
  if (data.currentLevel === "aal2") return "verified";
  if (data.nextLevel === "aal2") return "needs-verify";
  return "unenrolled";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [loading, setLoading]       = useState(true);
  const [mfaStatus, setMfaStatus]   = useState<MfaStatus>("loading");

  async function refreshMfaStatus() {
    const status = await checkMfaStatus();
    setMfaStatus(status);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        const status = await checkMfaStatus();
        setMfaStatus(status);
      } else {
        setMfaStatus("unenrolled");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session) {
          const status = await checkMfaStatus();
          setMfaStatus(status);
        } else {
          setMfaStatus("unenrolled");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMfaStatus("unenrolled");
  }

  async function enrollTotp() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Gastos", friendlyName: "Autenticador" });
    if (error || !data) throw new Error(error?.message ?? "Error al iniciar enrollment");
    return {
      factorId: data.id,
      qrCode:   data.totp.qr_code,
      secret:   data.totp.secret,
    };
  }

  async function verifyTotp(factorId: string, code: string) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new Error(error.message);
    setMfaStatus("verified");
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      mfaStatus,
      signIn,
      signOut,
      enrollTotp,
      verifyTotp,
      refreshMfaStatus,
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
