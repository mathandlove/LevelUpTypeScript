import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import logger from "./utils/logger";
import dataStore from "./dataStore";
import { LevelUpWebSocket, TokenData, isTokenData } from "./common/types";
import { getClientId } from "./services/dataService";

interface Message {
  type: string;
  token?: string;
  clientId?: string;
  documentId?: string;
  data?: any;
  payload?: any;
  message?: string;
}

const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour
const TOKEN_WAIT_TIMEOUT = 15 * 1000; // 15 seconds in milliseconds
const TOKEN_CHECK_INTERVAL = 200; // 200 milliseconds

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: LevelUpWebSocket) => {
    ws.clientId = "";
    ws.documentId = "";
    logger.info("🟢 New WebSocket connection established");

    let idleTimeout = resetIdleTimeout(ws, null);

    ws.on("message", (message) => {
      try {
        const parsedMessage: Message = JSON.parse(message.toString());
        logger.info("📥 Received WebSocket message", parsedMessage);
        idleTimeout = resetIdleTimeout(ws, idleTimeout);

        if (
          parsedMessage.type === "token" &&
          isTokenData(parsedMessage.payload.token)
        ) {
          console.log("🔑 New Token Saved");
          handleTokenMessage(ws, parsedMessage.payload.token);
        } else {
          console.log("failed to load token");
          console.log(parsedMessage.payload);
          throw new Error("Failed to load token");
        }
      } catch (err) {
        logger.error("❌ Failed to parse message", { error: err });
        console.log(err);
      }
    });

    ws.on("close", () => {
      logger.info("🔴 WebSocket connection closed");
    });

    // Send welcome message
    const welcomeMsg: Message = {
      type: "welcome",
      message: "Connected to WebSocket server",
    };
    logger.info("📤 Sending welcome message", { message: welcomeMsg });
    ws.send(JSON.stringify(welcomeMsg));

    // Example: Send a command to request updated OAuth scope
    setupIntervals(ws);

    logger.info("✨ WebSocket server initialized");
  });

  function setupIntervals(ws: LevelUpWebSocket) {
    const intervalId = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const updateScopeMsg: Message = {
          type: "updateScope",
          message: "Please update your OAuth scope",
        };
        logger.info("📤 Sending updateScope message", {
          message: updateScopeMsg,
        });
        ws.send(JSON.stringify(updateScopeMsg));
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

  async function handleTokenMessage(ws: LevelUpWebSocket, token: TokenData) {
    if (ws.clientId === "" && token.clientId === "") {
      //sidebar.html may or may not return clientId, depending on security.
      try {
        ws.clientId = await getClientId(token.token);
      } catch (err) {
        console.log(err);
        handleError(ws);
      }
    }
    let data = dataStore.getData(token.clientId, token.documentId);
    data.currentToken = token.token;
    ws.clientId = token.clientId;
    ws.documentId = token.documentId;
    dataStore.storeData(ws.clientId, ws.documentId, data);

    logger.info("🔑 New Token Saved", {
      clientId: ws.clientId,
      documentId: ws.documentId,
      token: token.token,
    });
  }

  function handleError(ws: LevelUpWebSocket) {
    console.log("At some point we will redirect sidebar.html here");
  }
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
