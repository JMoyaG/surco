import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const sqlConfig = {
  server: process.env.SQL_SERVER,
  port: Number(process.env.SQL_PORT || 1433),
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,

  options: {
    encrypt: process.env.SQL_ENCRYPT === "true",
    trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
  },
};

let pool;

export async function getConnection() {
  if (pool) return pool;

  console.log("Conectando SQL...", {
    server: sqlConfig.server,
    database: sqlConfig.database,
    user: sqlConfig.user,
  });

  pool = await sql.connect(sqlConfig);
  console.log("SQL conectado correctamente");

  return pool;
}

export { sql };