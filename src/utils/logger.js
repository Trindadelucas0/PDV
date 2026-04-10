const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "..", "logs");

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `app-${day}.log`);
}

function formatLine(level, message, err) {
  const ts = new Date().toISOString();
  let text =
    typeof message === "object" && message !== null && !(message instanceof Error)
      ? JSON.stringify(message)
      : String(message);
  if (err instanceof Error) {
    text += `\n${err.stack || err.message}`;
  } else if (err != null) {
    text += `\n${String(err)}`;
  }
  return `${ts} [${level}] ${text}\n`;
}

function write(level, message, err) {
  ensureLogsDir();
  const line = formatLine(level, message, err);
  const trimmed = line.trimEnd();

  if (level === "ERROR") {
    console.error(trimmed);
  } else if (level === "WARN") {
    console.warn(trimmed);
  } else {
    console.log(trimmed);
  }

  try {
    fs.appendFileSync(logFilePath(), line, "utf8");
  } catch (e) {
    console.error("Falha ao gravar log em arquivo:", e.message);
  }
}

module.exports = {
  info: (msg) => write("INFO", msg),
  warn: (msg, err) => write("WARN", msg, err),
  error: (msg, err) => write("ERROR", msg, err),
  http: (msg) => write("HTTP", msg)
};
