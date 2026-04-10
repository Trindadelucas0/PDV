const { Client } = require("pg");
const logger = require("../utils/logger");

/** Nome seguro para CREATE DATABASE (evita injeção de SQL). */
function assertValidDbName(name) {
  if (!name || typeof name !== "string") {
    throw new Error("DB_NAME não definido no .env");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 63) {
    throw new Error("DB_NAME deve ter entre 1 e 63 caracteres.");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(
      'DB_NAME inválido: use apenas letras, números e underscore, começando com letra ou "_".'
    );
  }
  return trimmed;
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

async function ensureDatabaseExists() {
  const dbName = assertValidDbName(process.env.DB_NAME || "");
  const adminDb = (process.env.DB_ADMIN_DATABASE || "postgres").trim();

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: adminDb
  });

  try {
    await client.connect();
    logger.info(`PostgreSQL: conectado ao banco administrativo "${adminDb}" (verificando "${dbName}").`);

    const { rows } = await client.query(
      "SELECT 1 AS ok FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (rows.length === 0) {
      logger.info(`Banco "${dbName}" não existe. Criando...`);
      await client.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      logger.info(`Banco "${dbName}" criado.`);
    } else {
      logger.info(`Banco "${dbName}" já existe.`);
    }
  } catch (err) {
    logger.error(`Falha ao garantir banco de dados "${dbName}"`, err);
    throw err;
  } finally {
    await client.end().catch((e) => logger.warn("Erro ao encerrar cliente admin PostgreSQL", e));
  }
}

module.exports = { ensureDatabaseExists };
