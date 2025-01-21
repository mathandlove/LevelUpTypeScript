import { WebSocketServer, WebSocket, RawData } from "ws";
import { Server } from "http";
import logger from "./utils/logger.js";
import { getOrCreateActor } from "./stateMachine.js";
import {
  isValidIncomingWebSocketMessage,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage,
} from "./common/wsTypes.js";

interface LevelUpWebSocket extends WebSocket {
  sendMessage: (message: OutgoingWebSocketMessage) => void;
}

const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: LevelUpWebSocket) => {
    logger.info("🟢 New WebSocket connection established");

    ws.on("message", (rawMessage: RawData) => {
      const message: IncomingWebSocketMessage = JSON.parse(
        rawMessage.toString()
      );
      if (isValidIncomingWebSocketMessage(message)) {
        console.log("Received message:", message);
      } else {
        console.error("Invalid message received:", message);
      }
    });

    ws.sendMessage = function (message: OutgoingWebSocketMessage) {
      this.send(JSON.stringify(message));
      logger.info(`\n%%% Sending message: ${JSON.stringify(message)}\n`);
    };

    ws.on("close", () => {
      logger.info("🔴 WebSocket connection closed");
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
