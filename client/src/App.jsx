import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api.js";

// Schelet M1: verifică legătura SPA → API → bază de date și arată stările de încărcare/eroare.
export default function App() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const load = useCallback(async (signal) => {
    setState({ status: "loading", data: null, error: null });
    try {
      const data = await apiFetch("/api/health", { signal });
      setState({ status: "ready", data, error: null });
    } catch (error) {
      if (error.name !== "AbortError") setState({ status: "error", data: null, error });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">Licitații live</span>
        <span className="tag">schelet M1</span>
      </header>

      <main className="content">
        <section className="card" aria-live="polite">
          <h1>Stare sistem</h1>
          {state.status === "loading" && <p className="muted">Se verifică serverul…</p>}
          {state.status === "error" && (
            <div className="alert" role="alert">
              <p>{state.error.message}</p>
              <button type="button" onClick={() => load()}>Reîncearcă</button>
            </div>
          )}
          {state.status === "ready" && (
            <dl className="facts">
              <dt>API</dt>
              <dd className="ok">{state.data.status}</dd>
              <dt>Ora serverului</dt>
              <dd>{new Date(state.data.serverTime).toLocaleString("ro-RO")}</dd>
            </dl>
          )}
        </section>

        <section className="card">
          <h2>Urmează în M2/M3</h2>
          <ul>
            <li>Autentificare (organizator / licitator)</li>
            <li>Catalog cu filtrare, ordonare și paginare</li>
            <li>Pagina licitației: preț live, countdown, istoric oferte</li>
            <li>Reconectare și resincronizare după <code>seq</code></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
