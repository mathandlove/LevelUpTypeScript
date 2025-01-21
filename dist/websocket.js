"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocket = initializeWebSocket;
exports.sendMessage = sendMessage;
const ws_1 = require("ws");
const logger_1 = __importDefault(require("./utils/logger"));
const xStateMachine_1 = require("./xStateMachine");
const IDLE_TIMEOUT = 60 * 60 * 1000; // 1 hour
function initializeWebSocket(server) {
    const wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws) => {
        ws.clientId = "";
        ws.documentId = "";
        logger_1.default.info("🟢 New WebSocket connection established");
        let idleTimeout = resetIdleTimeout(ws, null);
        ws.on("message", async (message) => {
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
                logger_1.default.info("✅ Valid message received", { type: data.type });
                handleWebSocketMessage(ws, data);
                idleTimeout = resetIdleTimeout(ws, idleTimeout);
            }
            catch (err) {
                logger_1.default.error("❌ Failed to parse message", { error: err });
                console.log(err);
            }
        });
        ws.on("close", () => {
            logger_1.default.info("🔴 WebSocket connection closed");
        });
        // Send welcome message
        sendMessage(ws, "welcome", "Connected to WebSocket server");
        //sendMessage(ws, "state", undefined, defaultUIState);
        // Example: Send a command to request updated OAuth scope
        setupIntervals(ws);
    });
    function setupIntervals(ws) {
        const intervalId = setInterval(() => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                sendMessage(ws, "updateScope", "Please update your OAuth scope");
            }
        }, 30 * 60 * 1000); // 30 minutes in milliseconds
        ws.on("close", () => {
            clearInterval(intervalId);
        });
    }
    function resetIdleTimeout(ws, oldIdleTimeout) {
        if (oldIdleTimeout) {
            clearTimeout(oldIdleTimeout);
        }
        let idleTimeout = setTimeout(() => {
            logger_1.default.info("🔴 Closing idle WebSocket connection");
            // TODO: send message to client to close.
            ws.terminate();
        }, IDLE_TIMEOUT);
        ws.on("close", () => {
            logger_1.default.info("🔴 WebSocket connection closed");
            clearTimeout(idleTimeout);
        });
        return idleTimeout;
    }
    function handleError(ws) {
        console.log("At some point we will redirect sidebar.html here");
    }
    function handleWebSocketMessage(ws, data) {
        try {
            logger_1.default.info(`### Received: ${JSON.stringify(data, null, 2)}`);
            switch (data.type) {
                case "token":
                    const tokenMessage = data;
                    const actor = (0, xStateMachine_1.getOrCreateActor)(tokenMessage.payload.clientId, tokenMessage.payload.documentId);
                    actor.send({
                        type: "RECEIVE_TOKEN",
                        token: tokenMessage.payload.token,
                        clientId: tokenMessage.payload.clientId,
                    });
                    break;
            }
        }
        catch (err) {
            console.log(err);
        }
    }
    // Type guard for WebSocketMessage
    function isValidWebSocketMessage(message) {
        if (!message || typeof message !== "object")
            return false;
        if (!message.type || typeof message.type !== "string")
            return false;
        // Check specific message types
        switch (message.type) {
            case "token":
                return (message.payload &&
                    typeof message.payload.clientId === "string" &&
                    typeof message.payload.documentId === "string" &&
                    typeof message.payload.token === "string");
            // Add other message types here
            default:
                return false;
        }
    }
}
function sendMessage(ws, type, message, payload) {
    const msg = {
        type,
        ...(message && { message }), // only add if message exists
        ...(payload && { payload }), // only add if payload exists
    };
    ws.send(JSON.stringify(msg));
    logger_1.default.info(`\n%%% Sending message: ${JSON.stringify(msg)}\n`);
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
