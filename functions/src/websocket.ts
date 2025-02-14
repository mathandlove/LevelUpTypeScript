import { WebSocketServer, WebSocket, RawData } from "ws";
import { Server } from "http";
import { getOrCreateActor } from "./levelStateMachine";
import {
  isValidIncomingWebSocketMessage,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage,
} from "./common/wsTypes";
import { v4 as uuidv4 } from "uuid";
import { defaultUIState } from "./common/types";

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
        handleInactivityTimeout();
      }, 20 * 60 * 1000); // 20 minutes of inactivity
    };

    function handleInactivityTimeout() {
      // Send UI Update: Transition to the error page
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("⚠️ WebSocket already closed or unavailable.");
        return;
      }
      console.log("⏳ 15 minutes of inactivity. Stopping WebSocket.");
      ws.sendMessage({
        type: "STATE",
        payload: {
          ...defaultUIState,
          currentPage: "server-error",
          errorMessage:
            "You've been disconnected due to inactivity. Please refresh to continue.",
          visibleButtons: [],
        },
      });

      // Send Special WebSocket Message: Stop reconnecting
      ws.sendMessage({
        type: "STOP_RECONNECT",
        payload: undefined,
      });

      // Close WebSocket and prevent further reconnections
      setTimeout(stopWebSocketReconnection, 100);
    }

    function stopWebSocketReconnection() {
      console.log("⏳ Stopping WebSocket reconnection.");
      ws.close();
    }

    resetInactivityTimer(); // Start inactivity tracking
    // Initialize the WebSocket with a sendMessage method
    ws.sendMessage = function (message: OutgoingWebSocketMessage) {
      this.send(JSON.stringify(message));
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
          ws.actor = getOrCreateActor(uniqueKey, ws);
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
      // Stop the token refresh loop
      if (tokenInterval) {
        clearInterval(tokenInterval);
        tokenInterval = null;
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
