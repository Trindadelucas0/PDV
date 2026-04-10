require("dotenv").config();
const logger = require("./utils/logger");
const { ensureDatabaseExists } = require("./config/ensureDatabase");

process.on("uncaughtException", (err) => {
  logger.error("Processo: uncaughtException (exceção não capturada)", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const err =
    reason instanceof Error
      ? reason
      : new Error(typeof reason === "object" ? JSON.stringify(reason) : String(reason));
  logger.error("Processo: unhandledRejection (Promise rejeitada sem catch)", err);
});

const PORT = Number(process.env.PORT || 3000);

async function start() {
  try {
    await ensureDatabaseExists();

    const initDb = require("./config/initDb");
    await initDb();

    const app = require("./app");
    app.listen(PORT, () => {
      logger.info(`Servidor HTTP escutando em http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("Erro ao iniciar o servidor", error);
    process.exit(1);
  }
}

start();
