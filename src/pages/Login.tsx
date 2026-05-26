import { useState } from "react";

type Props = {
  onLogin: () => void;
};

const usuarios = [
  {
    usuario: "Marcelo",
    password: "M4rc3l0242002",
    nombre: "Marcelo Rivera",
  },
  {
    usuario: "Sammy",
    password: "Surco2026",
    nombre: "Sammy Rojas",
  },
  {
    usuario: "Esteban",
    password: "Surco2026",
    nombre: "Esteban Gomez",
  },
  {
    usuario: "Esteban",
    password: "Surco2026",
    nombre: "Esteban Ureña",
  },
  {
    usuario: "Jose",
    password: "J0s3M0y4$",
    nombre: "Mejor Elemento",
  },
];

export default function Login({ onLogin }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const ingresar = () => {
    const usuarioEncontrado = usuarios.find(
      (u) =>
        u.usuario.toLowerCase() === usuario.toLowerCase() &&
        u.password === password
    );

    if (usuarioEncontrado) {
      localStorage.setItem(
        "surco_user",
        JSON.stringify(usuarioEncontrado)
      );

      onLogin();
    } else {
      setError("Usuario o contraseña incorrectos");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>SURCO Executive</h1>

        <p style={styles.subtitle}>
          Dashboard gerencial corporativo
        </p>

        <input
          style={styles.input}
          placeholder="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ingresar()}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} onClick={ingresar}>
          Ingresar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  card: {
    width: 380,
    background: "white",
    padding: 36,
    borderRadius: 22,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },

  title: {
    margin: 0,
    fontSize: 34,
    fontWeight: 700,
    color: "#0f172a",
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    color: "#64748b",
    fontSize: 15,
  },

  input: {
    width: "100%",
    padding: "14px 16px",
    marginBottom: 14,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },

  button: {
    width: "100%",
    padding: 14,
    border: "none",
    borderRadius: 12,
    background: "#0f172a",
    color: "white",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },

  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 14,
  },
};