import { useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [logged, setLogged] = useState(() => {
    return localStorage.getItem("jefes_bi_logged") === "true";
  });

  const handleLogin = () => {
    localStorage.setItem("jefes_bi_logged", "true");
    setLogged(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("jefes_bi_logged");
    setLogged(false);
  };

  return logged ? (
    <Dashboard onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}