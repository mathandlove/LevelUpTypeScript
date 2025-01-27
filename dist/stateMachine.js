import { createMachine, assign, interpret, send } from "xstate";
import { validateToken, getOrLoadDocumentMetaData, getPersistentDataFileId, } from "./services/dataService.js";
import { defaultUIState, } from "./common/types.js";
import { addChallengesToChallengeArrays, addChallengeDetailsToChallengeArray, } from "./services/aiService.js";
import { chatGPTKey } from "./resources/keys.js";
import { savePersistentDocData } from "./services/dataService.js";
const defaultDocState = "waiting for documentID";
const defaultAppState = {
    token: "Waiting for token...",
    clientId: "Waiting for clientID",
    documentId: "waiting for documentID",
    ws: null,
    persistentDataFileId: null,
    chatGPTKey,
    GoogleServices: null,
};
const defaultAppContext = {
    appState: defaultAppState,
    uiState: defaultUIState,
    documentMetaData: null,
};
// Store to track actors with explicit typing
const actorStore = new Map();
// Add a store for final states
const finalStateStore = new Map();
// Add state history to the stores
const stateHistoryStore = new Map();
// Add an event history store
const eventHistoryStore = new Map();
// Add helper function for sending UI updates
function sendUIUpdate(context) {
    const ws = context.appState.ws;
    if (ws === null || ws === void 0 ? void 0 : ws.sendMessage) {
        ws.sendMessage({
            type: "STATE",
            payload: context.uiState,
        });
    }
}
// Define a function to create the machine with initial context
export function createAppMachine(ws) {
    return createMachine({
        id: "app",
        type: "parallel",
        predictableActionArguments: true,
        context: Object.assign(Object.assign({}, defaultAppContext), { appState: Object.assign(Object.assign({}, defaultAppState), { ws: ws }) }),
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
                                        appState: (context, event) => (Object.assign(Object.assign({}, context.appState), { token: event.payload.token, clientId: event.payload.clientId, documentId: event.payload.documentId, ws: context.appState.ws })),
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
                                target: ["#app.ui.uiError", "error"],
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
                                        appState: (context, event) => (Object.assign(Object.assign({}, context.appState), { persistentDataFileId: event.data.persistentDataFileId, GoogleServices: event.data.GoogleServices })),
                                    }),
                                ],
                            },
                            onError: {
                                target: ["#app.ui.uiError", "error"],
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
                                target: ["#app.ui.uiError", "error"],
                            },
                        },
                    },
                    creatingChallenges: {
                        invoke: {
                            src: addChallengesToChallengeArrays,
                            onDone: {
                                target: "addChallengeDetails",
                                actions: [
                                    assign({
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { challengeArray: event.data })),
                                    }),
                                    (context) => {
                                        savePersistentDocData(context.appState.GoogleServices.oauth2Client, context.appState.documentId, context.appState.persistentDataFileId, context.documentMetaData);
                                    },
                                    //TODO there's an inefficiency here when we are saving without editing.
                                ],
                            },
                            onError: {
                                target: ["#app.ui.uiError", "error"],
                            },
                        },
                    },
                    addChallengeDetails: {
                        invoke: {
                            src: addChallengeDetailsToChallengeArray,
                            onDone: {
                                target: "Ready",
                                actions: [
                                    assign({
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { challengeArray: event.data })),
                                    }),
                                    send({
                                        type: "CHALLENGE_ARRAY_UPDATED",
                                    }),
                                    (context) => {
                                        savePersistentDocData(context.appState.GoogleServices.oauth2Client, context.appState.documentId, context.appState.persistentDataFileId, context.documentMetaData);
                                    },
                                ],
                            },
                        },
                    },
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
                                uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: context.uiState.pills.length === 0 })),
                            }),
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "home-page", visibleButtons: [] })),
                            }),
                            sendUIUpdate,
                        ],
                        on: {
                            TOPICS_UPDATED: {
                                actions: [
                                    assign({
                                        uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: false })),
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
                                                return Object.assign(Object.assign({}, context.documentMetaData), { selectedChallengeNumber: event.payload.buttonTitle });
                                            }
                                            return context.documentMetaData; // Return unchanged context if no match
                                        },
                                    }),
                                ],
                            },
                        },
                    },
                    waitForChallenge: {
                        entry: [
                            assign({
                                uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "home-page", visibleButtons: [], waitingAnimationOn: true })),
                            }),
                            sendUIUpdate,
                            send({
                                type: "INITIAL_ARRAY_CHECK", // This feels like cheating as we are initializing CHALLENGE_ARRAY not updating it.
                            }),
                        ],
                        //TODO: when our we've updated challenges, this needs to be called as well.
                        on: {
                            CHALLENGE_ARRAY_UPDATED: [
                                {
                                    target: "aiFeel", // Go to the "ai-feel" state if the condition is met
                                    cond: "isChallengeReady",
                                },
                            ],
                            INITIAL_ARRAY_CHECK: {
                                target: "aiFeel",
                                cond: "isChallengeReady",
                            },
                        },
                    },
                    aiFeel: {
                        entry: [
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "AI-Feeling", visibleButtons: ["back-button"], cardMainText: context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].aiFeeling, waitingAnimationOn: false })),
                            }),
                            sendUIUpdate,
                        ],
                        on: {
                            BUTTON_CLICKED: {
                                target: "home",
                                cond: (context, event) => event.payload.buttonId === "back-button",
                            },
                        },
                    },
                    uiError: {
                        entry: [
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "server-error", errorMessage: event.data.message, waitingAnimationOn: false })),
                            }),
                            sendUIUpdate,
                        ],
                    },
                },
            },
        },
    }, {
        actions: {
            assignDocMetaDataToUIState: assign({
                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { lastUpdated: new Date().toISOString(), level: context.documentMetaData.level, pills: context.documentMetaData.pills })),
            }),
        },
        guards: {
            isChallengeReady: (context) => {
                var _a, _b;
                const { challengeArray, selectedChallengeNumber } = context.documentMetaData;
                return (Array.isArray(challengeArray) &&
                    ((_b = (_a = challengeArray[selectedChallengeNumber]) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.ready) === true);
            },
        },
    });
}
// Update the actor creation function
// Update the actor creation function
export function getOrCreateActor(clientId, documentId, ws) {
    const key = `${clientId}:${documentId}`;
    if (actorStore.has(key)) {
        return actorStore.get(key);
    }
    let previousUIState = null;
    const baseActor = interpret(createAppMachine(ws))
        .onTransition((state) => {
        console.log(`🔄 State Changed:`, state.value); //[${key}]
        // Track state history
        const historyItem = {
            state: state.value,
            timestamp: Date.now(),
        };
        const stateHistory = stateHistoryStore.get(key) || [];
        if (stateHistory.length > 0 &&
            stateHistory[0].timestamp === historyItem.timestamp) {
            stateHistory.splice(1, 0, historyItem);
        }
        else {
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
        if (eventHistory.length > 0 &&
            eventHistory[0].timestamp === eventItem.timestamp) {
            eventHistory.splice(1, 0, eventItem);
        }
        else {
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
    });
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
        }
        catch (error) {
            console.error(`Error getting state for actor ${key}:`, error);
        }
    });
    return states;
}
// Optional: Add a function to clear history for a specific actor
export function clearHistory(clientId, documentId) {
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
//# sourceMappingURL=stateMachine.js.map