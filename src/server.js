require("dotenv").config();
const app = require("./app");
const initDb = require("./config/initDb");

const PORT = Number(process.env.PORT || 3000);

async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar o servidor:", error.message);
    process.exit(1);
  }
}

start();
