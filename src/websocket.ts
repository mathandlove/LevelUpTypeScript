import { WebSocketServer, WebSocket, RawData } from "ws";
import { Server } from "http";
import logger from "./utils/logger.js";
import { getOrCreateActor } from "./stateMachine.js";
import {
  isValidIncomingWebSocketMessage,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage,
} from "./common/wsTypes.js";

export interface LevelUpWebSocket extends WebSocket {
  sendMessage: (message: OutgoingWebSocketMessage) => void;
  actor?: ReturnType<typeof getOrCreateActor>;
}

const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: LevelUpWebSocket) => {
    console.log("🌐 New WebSocket connection");

    // Initialize the WebSocket with a sendMessage method
    ws.sendMessage = function (message: OutgoingWebSocketMessage) {
      this.send(JSON.stringify(message));
      console.log(`\n%%% Sending message: ${JSON.stringify(message)}\n`);
    };

    ws.on("message", (rawMessage: RawData) => {
      try {
        const message: IncomingWebSocketMessage = JSON.parse(
          rawMessage.toString()
        );

        if (isValidIncomingWebSocketMessage(message)) {
          console.log("📨 Received message:", message);

          // Create or get the actor for this connection
          ws.actor = getOrCreateActor(
            message.payload.clientId,
            message.payload.documentId,
            ws
          );
          if (ws.actor) {
            ws.actor.send(message);
          } else {
            console.error("❌ No actor available for message:", message);
          }
        }
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    });

    ws.on("close", () => {
      logger.info("🔴 WebSocket connection closed");
      // Clean up the actor when the connection closes
      ws.actor.stopAll(); // Stop the actor
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
