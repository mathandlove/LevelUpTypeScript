import {
  createMachine,
  assign,
  interpret,
  Interpreter,
  StateMachine,
} from "xstate";
import { getClientId, getDocumentMetaData } from "./services/dataService.js";
import {
  UIState,
  defaultUIState,
  DocumentMetaData,
  defaultDocumentMetaData,
} from "./common/types.js";
import { IncomingWebSocketMessage } from "./common/wsTypes.js";
import { LevelUpWebSocket } from "./websocket.js";

// Initialize the inspector (add this before creating the machine)

interface AppState {
  token: string;
  clientId: string;
  documentId: string;
  ws: LevelUpWebSocket;
}

// Define the DocState type
type DocState = string;

type ErrorMessageEvent = {
  type: "error";
  data: {
    name: string;
    message: string;
  };
};

const defaultDocState: DocState = "waiting for documentID";

type AppEvent = IncomingWebSocketMessage | ErrorMessageEvent;

const defaultAppState: AppState = {
  token: "Waiting for token...",
  clientId: "Waiting for clientID",
  documentId: "waiting for documentID",
  ws: null,
};

export interface AppContext {
  appState: AppState;
  uiState: UIState;
  documentMetaData: DocumentMetaData;
}

const defaultAppContext: AppContext = {
  appState: defaultAppState,
  uiState: defaultUIState,
  documentMetaData: defaultDocumentMetaData,
};

// Extend the interpreter type to include stopAll
interface ExtendedInterpreter
  extends Interpreter<AppContext, any, IncomingWebSocketMessage, any> {
  stopAll: () => void;
}

// Store to track actors with explicit typing
const actorStore = new Map<string, ExtendedInterpreter>();

// Add a store for final states
const finalStateStore = new Map<
  string,
  {
    state: any;
    context: AppContext;
    lastEvent: any;
    timestamp: number;
    stateHistory: StateHistoryItem[];
    eventHistory: Array<{
      type: string;
      timestamp: number;
      data?: any;
    }>;
  }
>();

// Add type for state history
type StateHistoryItem = {
  state: any;
  timestamp: number;
};

// Add state history to the stores
const stateHistoryStore = new Map<string, StateHistoryItem[]>();

// Add an event history store
const eventHistoryStore = new Map<
  string,
  Array<{
    type: string;
    timestamp: number;
    data?: any;
  }>
>();

// Add helper function for sending UI updates
function sendUIUpdate(context: AppContext) {
  const ws = context.appState.ws;
  if (ws?.sendMessage) {
    ws.sendMessage({
      type: "STATE",
      payload: context.uiState,
    });
  }
}

// Define a function to create the machine with initial context
export function createAppMachine(ws: LevelUpWebSocket) {
  return createMachine<AppContext, AppEvent>(
    {
      id: "app",
      initial: "initial",
      predictableActionArguments: true,
      context: {
        ...defaultAppContext,
        appState: {
          ...defaultAppState,
          ws: ws, // Initialize ws here
        },
      },
      states: {
        initial: {
          on: {
            GIVE_TOKEN: {
              target: "tokenReceived",
              actions: assign({
                appState: (context, event) => ({
                  ...context.appState,
                  token: event.payload.token,
                  clientId: event.payload.clientId,
                  documentId: event.payload.documentId,
                  ws: context.appState.ws, // Preserve the ws reference
                }),
              }),
            },
          },
        },
        tokenReceived: {
          invoke: {
            src: "validateTokenService",
            onDone: {
              target: "fetchingDocumentMetadata",
              actions: [
                (context, event) => {
                  console.log(
                    "Received valid token. Transitioning to authenticate"
                  );
                },
              ],
            },
            onError: {
              target: "error",
              actions: "displayError",
            },
          },
        },
        error: {
          type: "final",
          entry: [
            (context, event) => {
              console.log("Entered error state");
            },
          ],
        },
        fetchingDocumentMetadata: {
          invoke: {
            src: "getDocumentMetaData", // Reference to the fetching service
            onDone: {
              target: "homePage", // Transition to the success state
              actions: [
                assign({
                  appState: (context, event) => ({
                    ...context.appState,
                    documentMetaData: event.data, // Save fetched metadata
                  }),
                }),
                assignDocMetaDataToUIState,
              ],
            },
          },
        },
        homePage: {
          onEntry: [
            assign({
              uiState: (context, event) => ({
                ...context.uiState,
                currentPage: "home-page",
              }),
            }),
            sendUIUpdate,
          ],
          type: "final",
        },
      },
    },

    {
      actions: {
        requestNewTokenAction: () => {
          console.log("Requesting new token from server...");
        },
        displayError: (context, event: ErrorMessageEvent) => {
          console.log("Displaying error...");

          context.uiState.currentPage = "server-error";
          context.uiState.waitingAnimationOn = false;
          context.uiState.visibleButtons = ["back-button"];
          context.uiState.buttonsDisabled = [];
          context.uiState.errorMessage = event.data.message;
        },
        assignDocMetaDataToUIState,
      },
      services: {
        validateTokenService: (context: AppContext) => {
          return getClientId(context.appState.token);
        },
        getDocumentMetaData,
      },
      guards: {
        isAuthError: (_: any, event: any) => {
          const error = event.data;
          return error?.name === "AuthError";
        },
        isNetworkError: (_: any, event: any) => {
          const error = event.data;
          return error?.name === "NetworkError";
        },
      },
    }
  );
}

// Update the actor creation function
export function getOrCreateActor(
  clientId: string,
  documentId: string,
  ws: LevelUpWebSocket
): ExtendedInterpreter {
  const key = `${clientId}:${documentId}`;

  if (actorStore.has(key)) {
    return actorStore.get(key)!;
  }

  let previousUIState: UIState | null = null;

  const baseActor = interpret(createAppMachine(ws))
    .onTransition((state) => {
      console.log(`🔄 [${key}] State Changed:`, state.value);

      // Track state history
      const historyItem = {
        state: state.value,
        timestamp: Date.now(),
      };

      const stateHistory = stateHistoryStore.get(key) || [];
      if (
        stateHistory.length > 0 &&
        stateHistory[0].timestamp === historyItem.timestamp
      ) {
        stateHistory.splice(1, 0, historyItem);
      } else {
        stateHistory.unshift(historyItem);
      }
      if (stateHistory.length > 10) {
        stateHistory.pop();
      }
      stateHistoryStore.set(key, stateHistory);

      // Track event history

      const eventHistory = eventHistoryStore.get(key) || [];
      const eventItem = {
        type: state.event.type,
        timestamp: Date.now(),
      };

      if (
        eventHistory.length > 0 &&
        eventHistory[0].timestamp === eventItem.timestamp
      ) {
        eventHistory.splice(1, 0, eventItem);
      } else {
        eventHistory.unshift(eventItem);
      }
      if (eventHistory.length > 10) {
        eventHistory.pop();
      }
      eventHistoryStore.set(key, eventHistory);

      // Check if UI state has changed
      const currentUIState = state.context.uiState;
      if (
        previousUIState === null ||
        JSON.stringify(previousUIState) !== JSON.stringify(currentUIState)
      ) {
        // UI state has changed, notify client
        const ws = state.context.appState.ws;
        if (ws?.sendMessage) {
          ws.sendMessage({
            type: "STATE",
            payload: currentUIState,
          });
        }
        previousUIState = { ...currentUIState };
      }
    })
    .onStop(() => {
      console.log(`🛑 [${key}] Actor stopped`);
    })
    .start();

  // Create the extended actor with the stopAll method
  const actor = Object.assign(baseActor, {
    stopAll: () => {
      console.log(`Stopping all activities for actor [${key}]`);
      baseActor.stop();
      actorStore.delete(key);
      stateHistoryStore.delete(key);
      eventHistoryStore.delete(key);
    },
  }) as ExtendedInterpreter;

  actorStore.set(key, actor);
  return actor;
}

export function getActiveStates() {
  const states = new Map();

  actorStore.forEach((actor, key) => {
    try {
      const state = actor.getSnapshot();
      if (state) {
        // Add logging to debug state history
        const history = stateHistoryStore.get(key) || [];

        states.set(key, {
          state: state.value,
          context: state.context,
          isFinal: state.done,
          timestamp: Date.now(),
          stateHistory: history,
          eventHistory: eventHistoryStore.get(key) || [],
        });
      }
    } catch (error) {
      console.error(`Error getting state for actor ${key}:`, error);
    }
  });

  return states;
}

// Optional: Add a function to clear history for a specific actor
export function clearHistory(clientId: string, documentId: string) {
  const key = `${clientId}:${documentId}`;
  stateHistoryStore.delete(key);
  eventHistoryStore.delete(key);
}

// Optional: Add a cleanup function for very old final states
function cleanupOldFinalStates(maxAgeMs = 1000 * 60 * 60) {
  // default 1 hour
  const now = Date.now();
  finalStateStore.forEach((state, key) => {
    if (now - state.timestamp > maxAgeMs) {
      finalStateStore.delete(key);
    }
  });
}

const assignDocMetaDataToUIState = assign({
  uiState: (context: AppContext, event: any) => ({
    ...context.uiState,
    lastUpdated: new Date().toISOString(),
    level: context.documentMetaData.level, // Assign level from documentMetaData
    pills: context.documentMetaData.pills, // Assign pills from documentMetaData
  }),
});

// Run cleanup periodically
setInterval(cleanupOldFinalStates, 1000 * 60 * 15); // every 15 minutes
