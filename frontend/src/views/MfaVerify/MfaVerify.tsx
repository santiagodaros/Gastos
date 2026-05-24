import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import "./MfaVerify.css";

export default function MfaVerify() {
  const { verifyTotp, signOut } = useAuth();

  const [factorId,  setFactorId]  = useState("");
  const [code,      setCode]      = useState("");
  const [loading,   setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    // Fetch enrolled factors to get the factorId
    import("../../lib/supabase").then(({ supabase }) => {
      supabase.auth.mfa.listFactors().then(({ data }) => {
        const totp = data?.totp?.[0];
        if (totp) setFactorId(totp.id);
        setLoading(false);
      });
    });
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyTotp(factorId, code.replace(/\s/g, ""));
    } catch (err: unknown) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mfa-verify">
      <div className="mfa-verify__card">
        <div className="mfa-verify__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h1 className="mfa-verify__title">Verificación en dos pasos</h1>
        <p className="mfa-verify__subtitle">
          Ingresá el código de 6 dígitos de tu app autenticadora.
        </p>

        {loading && (
          <div className="mfa-verify__loading">
            <div className="spinner" />
          </div>
        )}

        {!loading && (
          <>
            {error && <div className="mfa-verify__error">{error}</div>}

            <form className="form" onSubmit={handleVerify}>
              <div className="form__field">
                <input
                  className="form__input mfa-verify__code-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000 000"
                  autoFocus
                  autoComplete="one-time-code"
                  required
                />
              </div>
              <button
                type="submit"
                className="mfa-verify__btn"
                disabled={verifying || code.replace(/\s/g,"").length < 6}
              >
                {verifying ? "Verificando..." : "Verificar"}
              </button>
            </form>
          </>
        )}

        <button type="button" className="mfa-verify__signout" onClick={signOut}>
          Volver al login
        </button>
      </div>
    </div>
  );
}
