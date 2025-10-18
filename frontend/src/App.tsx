import React, { useState } from "react";
import "./App.css";

const API_BASE =
  (process.env.REACT_APP_API_BASE_URL as string) || "http://localhost:8080";

function App(): React.ReactElement {
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function sayHello() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const resp = await fetch(`${API_BASE}/v1/hello`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Server returned ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as { message?: string };
      setMessage(data.message ?? "No message in response");
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="App" style={{ padding: 24 }}>
      <h2>Say Hello</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter name"
          style={{ padding: 8, width: 240 }}
        />
        <button
          onClick={sayHello}
          disabled={loading}
          style={{ marginLeft: 8, padding: "8px 12px" }}
        >
          {loading ? "Sending..." : "Say Hello"}
        </button>
      </div>

      {message && (
        <div style={{ color: "green", marginBottom: 8 }}>Response: {message}</div>
      )}
      {error && (
        <div style={{ color: "crimson", marginBottom: 8 }}>Error: {error}</div>
      )}

      <hr />

      <div style={{ fontSize: 12, color: "#666" }}>
        API: <code>{API_BASE}/v1/hello</code>
      </div>
    </div>
  );
}

export default App;