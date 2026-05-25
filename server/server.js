import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import dashboardRoutes from "./routes/dashboard.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "surco-executive-server", date: new Date().toISOString() });
});

app.use("/api/dashboard", dashboardRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SURCO Executive server corriendo en http://localhost:${PORT}`);
});
