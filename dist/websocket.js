"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocket = initializeWebSocket;
const ws_1 = require("ws");
const logger_js_1 = __importDefault(require("./utils/logger.js"));
const wsTypes_js_1 = require("./common/wsTypes.js");
const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour
function initializeWebSocket(server) {
    const wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws) => {
        logger_js_1.default.info("🟢 New WebSocket connection established");
        ws.on("message", (rawMessage) => {
            const message = JSON.parse(rawMessage.toString());
            if ((0, wsTypes_js_1.isValidIncomingWebSocketMessage)(message)) {
                console.log("Received message:", message);
            }
            else {
                console.error("Invalid message received:", message);
            }
        });
        ws.sendMessage = function (message) {
            this.send(JSON.stringify(message));
            logger_js_1.default.info(`\n%%% Sending message: ${JSON.stringify(message)}\n`);
        };
        ws.on("close", () => {
            logger_js_1.default.info("🔴 WebSocket connection closed");
        });
        // Send welcome message
        ws.sendMessage({
            type: "WELCOME",
            message: "Connected to WebSocket server",
        });
    });
    /*
    function setupIntervals(ws: LevelUpWebSocket) {
      const intervalId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.sendMessage(ws, "updateScope", "Please update your OAuth scope");
        }
      }, 30 * 60 * 1000); // 30 minutes in milliseconds
  
      ws.on("message", (message: IncomingWebSocketMessage) => {
        console.log("Received message:", message);
      });
  
      ws.on("send", (message: OutgoingWebSocketMessage) => {
        console.log("Sending message:", message);
      });
  
      ws.on("close", () => {
        clearInterval(intervalId);
      });
    }
  
    function resetIdleTimeout(
      ws: LevelUpWebSocket,
      oldIdleTimeout: NodeJS.Timeout | null
    ) {
      if (oldIdleTimeout) {
        clearTimeout(oldIdleTimeout);
      }
      let idleTimeout = setTimeout(() => {
        logger.info("🔴 Closing idle WebSocket connection");
        // TODO: send message to client to close.
        ws.terminate();
      }, IDLE_TIMEOUT);
  
      ws.on("close", () => {
        logger.info("🔴 WebSocket connection closed");
        clearTimeout(idleTimeout);
      });
      return idleTimeout;
    }
      */
}
