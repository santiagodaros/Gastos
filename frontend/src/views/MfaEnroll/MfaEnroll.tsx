import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import "./MfaEnroll.css";

export default function MfaEnroll() {
  const { enrollTotp, verifyTotp, signOut } = useAuth();

  const [factorId, setFactorId] = useState("");
  const [qrCode,   setQrCode]   = useState("");
  const [secret,   setSecret]   = useState("");
  const [code,     setCode]     = useState("");
  const [loading,  setLoading]  = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    enrollTotp()
      .then(({ factorId, qrCode, secret }) => {
        setFactorId(factorId);
        setQrCode(qrCode);
        setSecret(secret);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      await verifyTotp(factorId, code.replace(/\s/g, ""));
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mfa">
      <div className="mfa__card">
        <div className="mfa__brand">
          <div className="mfa__brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <div className="mfa__brand-title">Configurar autenticación</div>
            <div className="mfa__brand-sub">Paso único — se hace una sola vez</div>
          </div>
        </div>

        <h1 className="mfa__title">Activar doble factor</h1>
        <p className="mfa__subtitle">
          Escaneá el código QR con <strong>Microsoft Authenticator</strong>, Google Authenticator o cualquier app TOTP.
        </p>

        {loading && (
          <div className="mfa__loading">
            <div className="spinner" />
            <span>Generando código QR...</span>
          </div>
        )}

        {!loading && qrCode && (
          <>
            <div className="mfa__qr-wrapper">
              <img
                className="mfa__qr"
                src={qrCode}
                alt="QR code para autenticador"
              />
            </div>

            <button
              type="button"
              className="mfa__secret-toggle"
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? "Ocultar clave manual" : "No puedo escanear — ingresar clave manual"}
            </button>

            {showSecret && (
              <div className="mfa__secret">
                <span className="mfa__secret-label">Clave:</span>
                <code className="mfa__secret-value">{secret}</code>
              </div>
            )}

            <p className="mfa__step">
              Después de escanear, ingresá el código de 6 dígitos que muestra la app:
            </p>

            {error && <div className="mfa__error">{error}</div>}

            <form className="form" onSubmit={handleVerify}>
              <div className="form__field">
                <label className="form__label">Código de verificación</label>
                <input
                  className="form__input mfa__code-input"
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
              <button type="submit" className="mfa__btn" disabled={verifying || code.replace(/\s/g,"").length < 6}>
                {verifying ? "Verificando..." : "Activar y continuar"}
              </button>
            </form>
          </>
        )}

        {error && !qrCode && (
          <div className="mfa__error">{error}</div>
        )}

        <button type="button" className="mfa__signout" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
