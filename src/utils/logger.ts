import winston from "winston";
import path from "path";
import fs from "fs";

//   Get-Content -Path .\server-logs\websocket.log -Wait -Tail 10

// Create logs directory in project root, not in public
const logDir = path.join(__dirname, "../../server-logs"); // Changed from 'logs' to 'server-logs'
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  format: winston.format.printf(({ message }) => message as any),
  transports: [
    // File for all logs
    new winston.transports.File({
      filename: path.join(logDir, "websocket.log"),
      silent: false,
    }),
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logDir, "websocket-error.log"),
      level: "error",
      silent: false,
    }),
  ],
  silent: false,
});

export default logger;
