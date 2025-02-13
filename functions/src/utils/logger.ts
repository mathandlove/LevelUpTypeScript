import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory in project root, not in public
const logDir = path.join(__dirname, "../../server-logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  format: winston.format.printf(({ message }) => message as any),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "websocket.log"),
      silent: false,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "websocket-error.log"),
      level: "error",
      silent: false,
    }),
  ],
  silent: false,
});

export default logger;
