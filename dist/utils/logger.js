"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
//   Get-Content -Path .\server-logs\websocket.log -Wait -Tail 10
// Create logs directory in project root, not in public
const logDir = path_1.default.join(__dirname, "../../server-logs"); // Changed from 'logs' to 'server-logs'
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir);
}
const logger = winston_1.default.createLogger({
    format: winston_1.default.format.printf(({ message }) => message),
    transports: [
        // File for all logs
        new winston_1.default.transports.File({
            filename: path_1.default.join(logDir, "websocket.log"),
            silent: false,
        }),
        // Separate file for errors
        new winston_1.default.transports.File({
            filename: path_1.default.join(logDir, "websocket-error.log"),
            level: "error",
            silent: false,
        }),
    ],
    silent: false,
});
exports.default = logger;
