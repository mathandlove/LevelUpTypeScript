import { WebSocketServer, WebSocket, RawData } from "ws";
import { Server } from "http";
import logger from "./utils/logger.js";
import { getOrCreateActor } from "./levelStateMachine.js";
import {
  isValidIncomingWebSocketMessage,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage,
} from "./common/wsTypes.js";
import { v4 as uuidv4 } from "uuid";

export interface LevelUpWebSocket extends WebSocket {
  sendMessage: (message: OutgoingWebSocketMessage) => void;
  actor?: ReturnType<typeof getOrCreateActor>;
}

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: LevelUpWebSocket, req) => {
    const uniqueKey = uuidv4(); //req.headers["sec-websocket-key"];
    console.log("🌐 New WebSocket connection");
    let inactivityTimeout: NodeJS.Timeout | null = null;

    const resetInactivityTimer = () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(() => {
        logger.info(
          "⏳ Connection inactive for 30 minutes, closing WebSocket."
        );
        ws.close(); // Forcefully close the connection
      }, 30 * 60 * 1000); // 30 minutes of inactivity
    };
    resetInactivityTimer(); // Start inactivity tracking
    // Initialize the WebSocket with a sendMessage method
    ws.sendMessage = function (message: OutgoingWebSocketMessage) {
      this.send(JSON.stringify(message));
      logger.info(`\n%%% Sending message: ${JSON.stringify(message)}\n`);
    };

    ws.on("message", (rawMessage: RawData) => {
      resetInactivityTimer();
      try {
        const message: IncomingWebSocketMessage = JSON.parse(
          rawMessage.toString()
        );
        if (isValidIncomingWebSocketMessage(message)) {
          //logger.info("📨 Received message:", message);
          // Create or get the actor for this connection
          ws.actor = getOrCreateActor(
            uniqueKey,
            message.payload.documentId,
            ws
          );
          if (ws.actor) {
            ws.actor.send(message);
          } else {
            console.error("❌ No actor available for message:", message);
          }
        } else {
          console.error("❌ Invalid message:", message);
        }
      } catch (error) {
        console.error("❌ Error processing message:", error);
      }
    });

    ws.on("close", () => {
      logger.info("🔴 WebSocket connection closed");

      // Stop the token refresh loop
      if (tokenInterval) {
        clearInterval(tokenInterval);
        tokenInterval = null;
        logger.info("🛑 Token refresh stopped.");
      }

      // Clean up the actor when the connection closes
      ws.actor?.stopAll();
    });
    // Send welcome message
    ws.sendMessage({
      type: "WELCOME",
      message: "Connected to WebSocket server",
    });

    let tokenInterval: NodeJS.Timeout | null = null; // Store the interval ID
    tokenInterval = setInterval(() => {
      console.log("🔄 Requesting new token...");
      ws.send(JSON.stringify({ type: "UPDATE_SCOPE_REQUEST" }));
    }, 30 * 60 * 1000);
  });
}
