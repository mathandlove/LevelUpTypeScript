import { WebSocketServer, WebSocket, RawData } from "ws";
import { Server } from "http";
import logger from "./utils/logger";
import dataStore from "./dataStore";
import {
  LevelUpWebSocket,
  TokenPayload,
  isTokenData,
  UIState,
  defaultUIState,
  WebSocketMessage,
  TokenMessage,
  WebSocketMessageType,
  ButtonClickedPayload,
} from "./common/types";
import { orchestrate } from "./stateMachine";
import { getOrCreateActor } from "./xStateMachine";

const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: LevelUpWebSocket) => {
    ws.clientId = "";
    ws.documentId = "";
    logger.info("🟢 New WebSocket connection established");

    let idleTimeout = resetIdleTimeout(ws, null);

    ws.on("message", async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        // Validate message format
        if (!isValidWebSocketMessage(data)) {
          console.error("❌ Invalid message format", {
            received: data,
            expectedFormat: {
              type: "string (token, state, etc)",
              payload: "object matching type requirements",
            },
          });
          return;
        }

        logger.info("✅ Valid message received", { type: data.type });
        handleWebSocketMessage(ws, data);
        idleTimeout = resetIdleTimeout(ws, idleTimeout);
      } catch (err) {
        logger.error("❌ Failed to parse message", { error: err });
        console.log(err);
      }
    });

    ws.on("close", () => {
      logger.info("🔴 WebSocket connection closed");
    });

    // Send welcome message
    sendMessage(ws, "welcome", "Connected to WebSocket server");
    //sendMessage(ws, "state", undefined, defaultUIState);

    // Example: Send a command to request updated OAuth scope
    setupIntervals(ws);
  });

  function setupIntervals(ws: LevelUpWebSocket) {
    const intervalId = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        sendMessage(ws, "updateScope", "Please update your OAuth scope");
      }
    }, 30 * 60 * 1000); // 30 minutes in milliseconds

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

  function handleError(ws: LevelUpWebSocket) {
    console.log("At some point we will redirect sidebar.html here");
  }

  function handleWebSocketMessage(
    ws: LevelUpWebSocket,
    data: WebSocketMessage
  ) {
    try {
      logger.info(`### Received: ${JSON.stringify(data, null, 2)}`);
      switch (data.type) {
        case "token":
          const tokenMessage = data as TokenMessage;
          const actor = getOrCreateActor(
            tokenMessage.payload.clientId,
            tokenMessage.payload.documentId
          );
          actor.send({
            type: "RECEIVE_TOKEN",
            token: tokenMessage.payload.token,
            clientId: tokenMessage.payload.clientId,
          });
          break;
      }
    } catch (err) {
      console.log(err);
    }
  }

  // Type guard for WebSocketMessage
  function isValidWebSocketMessage(message: any): message is WebSocketMessage {
    if (!message || typeof message !== "object") return false;
    if (!message.type || typeof message.type !== "string") return false;

    // Check specific message types
    switch (message.type) {
      case "token":
        return (
          message.payload &&
          typeof message.payload.clientId === "string" &&
          typeof message.payload.documentId === "string" &&
          typeof message.payload.token === "string"
        );
      // Add other message types here
      default:
        return false;
    }
  }
}

export function sendMessage(
  ws: LevelUpWebSocket,
  type: WebSocketMessageType,
  message?: string,
  payload?: UIState | ButtonClickedPayload | TokenPayload
) {
  const msg: WebSocketMessage = {
    type,
    ...(message && { message }), // only add if message exists
    ...(payload && { payload }), // only add if payload exists
  };
  ws.send(JSON.stringify(msg));
  logger.info(`\n%%% Sending message: ${JSON.stringify(msg)}\n`);
}
//TODO will need this error state later
/*
    if (dataError) {
      //Waiting to receive token.

      const state: UIState = {
        currentPage: "home",
        waitingAnimationOn: true,
      };

      ws.send(JSON.stringify({ type: "state", state: state }));

      const tokenCheckInterval = setInterval(() => {
        const token = checkToken(clientId, documentId);
        if (token) {
          clearInterval(tokenCheckInterval);
          clearTimeout(tokenWaitTimeout);
          handleFoundToken(ws, clientId, documentId);
        }
      }, TOKEN_CHECK_INTERVAL);

      const tokenWaitTimeout = setTimeout(() => {
        clearInterval(tokenCheckInterval);
        const state: UIState = {
          currentPage: "error",
          waitingAnimationOn: false,
        };
        ws.send(JSON.stringify({ type: "state", state: state }));
        ws.send(
          JSON.stringify({ type: "close", message: "Closing connection" })
        );
      }, TOKEN_WAIT_TIMEOUT);

      ws.on("close", () => {
        clearInterval(tokenCheckInterval);
        clearTimeout(tokenWaitTimeout);
      });
    }
  }
  function handleFoundToken(
    ws: WebSocket,
    clientId: string,
    documentId: string
  ) {
    let state = dataStore.getState(clientId, documentId);
    state.waitingAnimationOn = false;

    ws.send(
      JSON.stringify({
        type: "state",
        state: state,
      })
    );
    dataStore.setState(clientId, documentId, state);
  }
    */
