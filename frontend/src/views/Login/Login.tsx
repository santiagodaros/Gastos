import { useState } from "react";
import { useAuth } from "../../lib/auth";
import "./Login.css";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        {/* Brand */}
        <div className="login__brand">
          <div className="login__brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <div className="login__brand-title">Gastos</div>
            <div className="login__brand-sub">Finanzas personales</div>
          </div>
        </div>

        <h1 className="login__title">Bienvenido</h1>
        <p className="login__subtitle">Ingresá con tu cuenta para continuar</p>

        {error && <div className="login__error">{error}</div>}

        <form className="form" onSubmit={handleSubmit}>
          <div className="form__field">
            <label className="form__label">Email</label>
            <input
              className="form__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="form__field">
            <label className="form__label">Contraseña</label>
            <input
              className="form__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="login__btn" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
