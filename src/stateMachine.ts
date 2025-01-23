import { createMachine, assign, interpret, Interpreter, send } from "xstate";
import {
  validateToken,
  getOrLoadDocumentMetaData,
  getPersistentDataFileId,
} from "./services/dataService.js";
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
  persistentDataFileId: string;
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

type InternalEvent = {
  type: "TOPICS_UPDATED";
};

const defaultDocState: DocState = "waiting for documentID";

// Add button click to AppEvent type
type AppEvent = IncomingWebSocketMessage | ErrorMessageEvent | InternalEvent;

const defaultAppState: AppState = {
  token: "Waiting for token...",
  clientId: "Waiting for clientID",
  documentId: "waiting for documentID",
  ws: null,
  persistentDataFileId: null,
};

export interface AppContext {
  appState: AppState;
  uiState: UIState;
  documentMetaData: DocumentMetaData;
}

const defaultAppContext: AppContext = {
  appState: defaultAppState,
  uiState: defaultUIState,
  documentMetaData: null,
};

// Update the ExtendedInterpreter interface to use AppEvent
interface ExtendedInterpreter
  extends Interpreter<AppContext, any, AppEvent, any> {
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
      type: "parallel",
      predictableActionArguments: true,
      context: {
        ...defaultAppContext,
        appState: {
          ...defaultAppState,
          ws: ws, // Initialize ws here
        },
      },
      states: {
        challengeData: {
          initial: "initial",
          states: {
            initial: {
              on: {
                GIVE_TOKEN: {
                  target: "validatingToken",
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        token: event.payload.token,
                        clientId: event.payload.clientId,
                        documentId: event.payload.documentId,
                        ws: context.appState.ws, // Preserve the ws reference
                      }),
                    }),
                  ],
                },
              },
            },
            validatingToken: {
              invoke: {
                src: validateToken,
                onDone: {
                  target: "loadingPersistentData",
                },
                onError: {
                  target: "error",
                },
              },
            },
            loadingPersistentData: {
              invoke: {
                src: getPersistentDataFileId,
                onDone: {
                  target: "loadingDocumentMetaData",
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        persistentDataFileId: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "error",
                  actions: [],
                },
              },
            },
            loadingDocumentMetaData: {
              invoke: {
                src: getOrLoadDocumentMetaData,
                onDone: {
                  target: "creatingChallenges",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => event.data,
                    }),
                    "assignDocMetaDataToUIState",
                    send({
                      type: "TOPICS_UPDATED",
                    }),
                  ],
                },
                onError: {
                  target: "error",
                },
              },
            },
            creatingChallenges: {},
            Ready: {},
            error: {
              entry: [
                (context, event) => {
                  console.log("Entered error state");
                },
              ],
            },
          },
        },
        ui: {
          initial: "home",
          states: {
            home: {
              entry: [
                assign({
                  uiState: (context: AppContext) => ({
                    ...context.uiState,
                    waitingAnimationOn: context.uiState.pills.length === 0,
                  }),
                }),
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "home-page",
                    visibleButtons: [],
                  }),
                }),
                sendUIUpdate,
              ],
              on: {
                TOPICS_UPDATED: {
                  actions: [
                    assign({
                      uiState: (context: AppContext) => ({
                        ...context.uiState,
                        waitingAnimationOn: false, //weird corner case if you make your default topics 0!
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
                BUTTON_CLICKED: {
                  target: "waitForChallenge",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => {
                        if (event.payload.buttonId === "pill-button") {
                          return {
                            ...context.documentMetaData,
                            selectedChallengeNumber: event.payload.buttonTitle,
                          };
                        }
                        return context.documentMetaData; // Return unchanged context if no match
                      },
                    }),
                    send({
                      type: "CHALLENGE_SELECTED",
                    }),
                  ],
                },
              },
            },
            waitForChallenge: {
              entry: [
                (context) => {
                  console.log(context.documentMetaData.challengeArray);
                },
                assign({
                  uiState: (context) => ({
                    ...context.uiState,
                    currentPage: "home-page",
                    visibleButtons: [],
                    waitingAnimationOn: true, // Show waiting animation if challenge is not ready
                  }),
                }),
                sendUIUpdate,
              ],
              always: [
                {
                  target: "aiFeel", // Go to the "ai-feel" state if the condition is met
                  cond: (context) => {
                    const { challengeArray, selectedChallengeNumber } =
                      context.documentMetaData;

                    // Check if the challenge exists and is ready
                    return (
                      Array.isArray(challengeArray) &&
                      challengeArray[selectedChallengeNumber]?.[0]?.ready ===
                        true
                    );
                  },
                },
                {
                  // No target, stays in the current state if the condition is not met
                  actions: (context) => {
                    console.log("Challenge not ready or does not exist.");
                  },
                },
              ],
            },
            aiFeel: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "AI-Feeling",
                    visibleButtons: ["back-button"],
                  }),
                }),
                sendUIUpdate,
              ],
            },
            error: {
              on: {
                BUTTON_CLICKED: {
                  // Add button click handling for error state
                },
              },
            },
          },
        },
      },
    },
    {
      actions: {
        assignDocMetaDataToUIState: assign({
          uiState: (context: AppContext, event: any) => ({
            ...context.uiState,
            lastUpdated: new Date().toISOString(),
            level: context.documentMetaData.level, // Assign level from documentMetaData
            pills: context.documentMetaData.pills, // Assign pills from documentMetaData
          }),
        }),
      },
    }
  );
}

// Update the actor creation function
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
      console.log(`🔄 State Changed:`, state.value); //[${key}]

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
  }) as unknown as ExtendedInterpreter;

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

// Run cleanup periodically
setInterval(cleanupOldFinalStates, 1000 * 60 * 15); // every 15 minutes
