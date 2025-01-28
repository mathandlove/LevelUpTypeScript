import {
  createMachine,
  assign,
  interpret,
  Interpreter,
  send,
  actions,
} from "xstate";
import {
  validateToken,
  getOrLoadDocumentMetaData,
  getPersistentDataFileId,
  savePersistentDocData,
} from "./services/dataService.js";
import {
  UIState,
  defaultUIState,
  DocumentMetaData,
  defaultDocumentMetaData,
} from "./common/types.js";
import { IncomingWebSocketMessage } from "./common/wsTypes.js";
import { LevelUpWebSocket } from "./websocket.js";
import {
  addChallengesToChallengeArrays,
  addChallengeDetailsToChallengeArray,
  checkChallengeResponse,
  getCelebration,
  getFailedFeedback,
} from "./services/aiService.js";
import { chatGPTKey } from "./resources/keys.js";
import { OAuth2Client } from "google-auth-library";
import {
  getFullText,
  highlightChallengeSentence,
} from "./services/googleServices.js";
import {
  compareNewSentenceToOldSentence,
  updateTextCoordinates,
} from "./services/docServices.js";

// Initialize the inspector (add this before creating the machine)

interface AppState {
  token: string;
  clientId: string;
  documentId: string;
  ws: LevelUpWebSocket;
  persistentDataFileId: string;
  chatGPTKey: string;
  GoogleServices: {
    oauth2Client: OAuth2Client; // Authenticated OAuth2 client
    drive: any; // Google Drive API client
    docs: any; // Google Docs API client
    sheets: any; // Google Sheets API client
  };
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

type InternalEvent =
  | { type: "TOPICS_UPDATED" }
  | { type: "INITIAL_ARRAY_CHECK" }
  | { type: "CHALLENGE_SELECTED"; payload: { topicNumber: number } } // Add payload here
  | { type: "NEW_CHALLENGES_AVAILABLE" }
  | { type: "CHALLENGE_READY" }
  | { type: "CREATE_CHALLENGES" }
  | {
      type: "REVIEWED";
      payload: {
        challengeResponse: "noChanges" | "tooFar" | "incorrect" | "correct";
      };
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
  chatGPTKey,
  GoogleServices: null,
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
        ChallengeCreator: {
          initial: "idle",
          states: {
            idle: {
              on: {
                CREATE_CHALLENGES: {
                  target: "createChallenges",
                },
              },
            },
            createChallenges: {
              invoke: {
                src: addChallengesToChallengeArrays,
                onDone: {
                  target: "addChallengeDetails",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        newChallengesArray: event.data,
                      }),
                    }),

                    // TODO: There's an inefficiency here when we are saving without editing.
                  ],
                },
                onError: {
                  target: ["#app.UI.uiError", "error", "#app.MainFlow.error"],
                },
              },
            },
            addChallengeDetails: {
              invoke: {
                src: addChallengeDetailsToChallengeArray,
                onDone: {
                  target: "idle",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        newChallengesArray: event.data,
                        newChallengesReady: true,
                      }),
                    }),
                    send({
                      type: "NEW_CHALLENGES_AVAILABLE",
                    }),
                  ],
                },
              },
            },
            error: {
              entry: [
                (context, event) => {
                  console.log("Entered error state in Challenge Creator");
                },
              ],
            },
          },
        },
        MainFlow: {
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
                  target: [
                    "#app.UI.uiError",
                    "error",
                    "#app.ChallengeCreator.error",
                  ],
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
                        persistentDataFileId: event.data.persistentDataFileId,
                        GoogleServices: event.data.GoogleServices,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "error",
                    "#app.ChallengeCreator.error",
                  ],
                },
              },
            },
            loadingDocumentMetaData: {
              invoke: {
                src: getOrLoadDocumentMetaData,
                onDone: {
                  target: "updateTextInitial",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => event.data,
                    }),

                    "assignDocMetaDataToUIState",
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "error",
                    "#app.ChallengeCreator.error",
                  ],
                },
              },
            },
            updateTextInitial: {
              invoke: {
                src: getFullText,
                onDone: {
                  target: ["idleHome"],
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        textBeforeEdits: context.documentMetaData.currentText,
                        currentText: event.data,
                      }),
                    }),
                    send({
                      type: "TOPICS_UPDATED",
                    }),
                    send({
                      type: "CREATE_CHALLENGES",
                    }),
                  ],
                },
              },
            },
            idleHome: {
              on: {
                CHALLENGE_SELECTED: {
                  target: "updateTextOnChallengeSelected",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        selectedChallengeNumber: event.payload.topicNumber,
                      }),
                    }),
                    (context, event) =>
                      console.log(
                        "challenge number selected: " +
                          context.documentMetaData.selectedChallengeNumber
                      ),
                  ],
                },
                NEW_CHALLENGES_AVAILABLE: {
                  actions: [
                    "addNewChallengesToChallengeArray",
                    (context) => savePersistentDocData(context),
                  ],
                },
              },
            },
            updateTextOnChallengeSelected: {
              invoke: {
                src: getFullText,
                onDone: {
                  target: "updateTextCoordinates",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        textBeforeEdits: context.documentMetaData.currentText,
                        currentText: event.data,
                      }),
                    }),
                  ],
                },
              },
            },
            updateTextCoordinates: {
              entry: [
                "addNewChallengesToChallengeArray",
                (context) => savePersistentDocData(context),
              ],
              invoke: {
                src: (context) =>
                  Promise.resolve(updateTextCoordinates(context)),
                onDone: {
                  target: "checkForChallenges",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        challengeArray: event.data,
                      }),
                    }),
                  ],
                },
              },
            },
            checkForChallenges: {
              always: [
                {
                  cond: (context) => {
                    const { challengeArray, selectedChallengeNumber } =
                      context.documentMetaData || {};

                    // Ensure challengeArray and selectedChallengeNumber are valid
                    if (
                      !Array.isArray(challengeArray) || // Validate challengeArray is an array
                      !Array.isArray(challengeArray[selectedChallengeNumber]) // Validate nested array
                    ) {
                      return false; // Safely return false if data is invalid
                    }

                    // Safely access sentenceStartIndex and compare
                    const challenge =
                      challengeArray[selectedChallengeNumber]?.[0];
                    return challenge?.sentenceStartIndex >= 0;
                  },
                  actions: send({
                    type: "CHALLENGE_READY", // Notify UI
                  }),
                  target: "idleOnChallenge", // Transition to idle after notifying UI
                },
                {
                  cond: (context, event, { state }) =>
                    state.matches({ ChallengeCreator: "idle" }),
                  target: [
                    "waitForChallengesToComplete",
                    "#app.ChallengeCreator.createChallenges",
                  ], // Start ChallengeCreator if it's idle
                },
                {
                  target: "waitForChallengesToComplete", // Wait if ChallengeCreator is already creating challenges
                },
              ],
            },
            waitForChallengesToComplete: {
              on: {
                NEW_CHALLENGES_AVAILABLE: {
                  target: "updateTextOnChallengeSelected", //Which will also load any texts for updating!
                },
              },
            },
            idleOnChallenge: {
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "idleHome",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "idleHome",
                    cond: (context, event) =>
                      event.payload.buttonId === "skip-button",
                    actions: [
                      "shiftTopicChallenge",
                      "savePersistentDocData",
                      send({
                        type: "CREATE_CHALLENGES",
                      }),
                    ],
                  },
                  {
                    target: "getUpdatedFullText",
                    cond: (context, event) =>
                      event.payload.buttonId === "check-work-button",
                  },
                ],
              },
            },
            getUpdatedFullText: {
              invoke: {
                src: getFullText,
                onDone: {
                  target: "evaluateTextChanges",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        textBeforeEdits: context.documentMetaData.currentText,
                        currentText: event.data,
                      }),
                    }),
                  ],
                },
              },
            },
            evaluateTextChanges: {
              entry: [
                assign({
                  documentMetaData: (context: AppContext) => {
                    const {
                      challengeResponse,
                      modifiedSentences,
                      modifiedStartIndex,
                      modifiedEndIndex,
                    } = compareNewSentenceToOldSentence(context);

                    console.log("modifiedSentences:", modifiedSentences);

                    // Find the selected challenge
                    const updatedChallengeArray = [
                      ...context.documentMetaData.challengeArray,
                    ];
                    const selectedChallengeNumber =
                      context.documentMetaData.selectedChallengeNumber;

                    // Ensure the array and challenge exist before updating
                    if (
                      updatedChallengeArray[selectedChallengeNumber] &&
                      updatedChallengeArray[selectedChallengeNumber][0]
                    ) {
                      updatedChallengeArray[selectedChallengeNumber][0] = {
                        ...updatedChallengeArray[selectedChallengeNumber][0],
                        challengeResponse,
                        modifiedSentences,
                        sentenceStartIndex: modifiedStartIndex,
                        sentenceEndIndex: modifiedEndIndex,
                      };
                    } else {
                      console.warn("Selected challenge does not exist.");
                    }

                    // Return updated documentMetaData with the modified challengeArray
                    return {
                      ...context.documentMetaData,
                      challengeArray: updatedChallengeArray,
                    };
                  },
                }),
              ],

              always: [
                {
                  cond: (context) =>
                    context.documentMetaData.challengeArray[
                      context.documentMetaData.selectedChallengeNumber
                    ][0].challengeResponse === "valid",
                  target: "getAIJudgement",
                },
                {
                  cond: (context) =>
                    context.documentMetaData.challengeArray[
                      context.documentMetaData.selectedChallengeNumber
                    ][0].challengeResponse === "noChanges",
                  target: "idleOnChallenge",
                  actions: [
                    send({
                      type: "REVIEWED",
                      payload: {
                        challengeResponse: "noChanges",
                      },
                    }),
                  ],
                },
                {
                  cond: (context) =>
                    context.documentMetaData.challengeArray[
                      context.documentMetaData.selectedChallengeNumber
                    ][0].challengeResponse === "tooFar",
                  target: "idleOnChallenge",
                  actions: [
                    send({
                      type: "REVIEWED",
                      payload: {
                        challengeResponse: "tooFar",
                      },
                    }),
                  ],
                },
                {
                  target: "error", //put tooFar in here eventually
                  actions: [
                    (context) => {
                      console.log(
                        context.documentMetaData.challengeArray[
                          context.documentMetaData.selectedChallengeNumber
                        ][0].challengeResponse
                      );
                    },
                  ],
                },
              ],
            },
            getAIJudgement: {
              invoke: {
                src: checkChallengeResponse,
                onDone: [
                  {
                    cond: (context, event) => event.data === true,
                    target: "levelUpPill",
                  },
                  {
                    target: "getFeedback",
                  },
                ],
              },
            },
            levelUpPill: {
              always: [
                {
                  target: "getCelebration",
                  actions: [
                    assign({
                      documentMetaData: (context) => {
                        const { selectedChallengeNumber, pills, level } =
                          context.documentMetaData;

                        if (
                          typeof selectedChallengeNumber === "number" &&
                          pills[selectedChallengeNumber]
                        ) {
                          // Create a new pills array with the updated pill
                          const updatedPills = pills.map((pill, index) =>
                            index === selectedChallengeNumber
                              ? { ...pill, current: pill.current + 1 }
                              : pill
                          );

                          // Return the updated documentMetaData
                          return {
                            ...context.documentMetaData,
                            pills: updatedPills,
                            level: level + 1, // Increment the level
                          };
                        } else {
                          throw new Error(
                            "Invalid selectedChallengeNumber or pill not found"
                          );
                        }
                      },
                    }),
                    savePersistentDocData,
                  ],
                },
              ],
            },
            getCelebration: {
              invoke: {
                src: getCelebration,
                onDone: {
                  target: "idleHome",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedbackMessage: event.data,
                      }),
                    }),
                    send({
                      type: "REVIEWED",
                      payload: {
                        challengeResponse: "correct",
                      },
                    }),
                  ],
                },
              },
            },
            getFeedback: {
              invoke: {
                src: getFailedFeedback,
                onDone: {
                  target: "idleOnChallenge",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedbackMessage: event.data,
                      }),
                    }),
                    send({
                      type: "REVIEWED",
                      payload: {
                        challengeResponse: "incorrect",
                      },
                    }),
                    (context, event) => {
                      console.log("Incorrect: ", event.data);
                    },
                  ],
                },
              },
            },
            error: {
              entry: [
                (context, event) => {
                  console.log("Entered error state");
                },
              ],
            },
          },
        },
        UI: {
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
                        currentPage: "home-page",
                        waitingAnimationOn: false,
                        visibleButtons: [],
                      }),
                    }),
                    //Animate up to current level
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        formerLevel: 1,
                        animateLevelUp: true,
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
                BUTTON_CLICKED: {
                  target: "celebrateScreen", //debug
                  //target: "waitForChallenge", // Transition to a loading state
                  cond: (context, event) =>
                    event.payload.buttonId === "pill-button", // Only handle pill-button
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        selectedChallengeNumber: event.payload.buttonTitle, // Assign buttonTitle to selectedChallengeNumber
                      }),
                    }),
                    send((context, event) => ({
                      type: "CHALLENGE_SELECTED",
                      payload: {
                        topicNumber: event.payload.buttonTitle, // Use buttonTitle as topicNumber
                      },
                    })), // Ensure the action is returned properly
                  ],
                },
              },
            },
            waitForChallenge: {
              entry: [
                assign({
                  uiState: (context) => ({
                    ...context.uiState,
                    currentPage: "home-page",
                    visibleButtons: [],
                    waitingAnimationOn: true, // Show waiting animation if challenge is not ready
                  }),
                }),
                sendUIUpdate,
                send({
                  type: "INITIAL_ARRAY_CHECK", // This feels like cheating as we are initializing CHALLENGE_ARRAY not updating it.
                }),
              ],
              //TODO: when our we've updated challenges, this needs to be called as well.
              on: {
                CHALLENGE_READY: {
                  target: "aiFeel", // Go to the "ai-feel" state if the condition is met
                },
              },
            },
            aiFeel: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "AI-Feeling",
                    visibleButtons: ["back-button", "next-button"],
                    cardMainText:
                      context.documentMetaData.challengeArray[
                        context.documentMetaData.selectedChallengeNumber
                      ][0].aiFeeling,
                    waitingAnimationOn: false,
                  }),
                }),
                sendUIUpdate,
                highlightChallengeSentence,
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "home",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "challengeTaskDisplay",
                    cond: (context, event) =>
                      event.payload.buttonId === "next-button",
                  },
                ],
              },
            },
            challengeTaskDisplay: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "challenge-card",
                    visibleButtons: ["skip-button", "check-work-button"],
                    waitingAnimationOn: false,
                    tasks:
                      context.documentMetaData.challengeArray[
                        context.documentMetaData.selectedChallengeNumber
                      ][0].taskArray,
                    cardSubtitle:
                      context.documentMetaData.challengeArray[
                        context.documentMetaData.selectedChallengeNumber
                      ][0].challengeTitle,
                    taskFeedback: undefined,
                  }),
                }),
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "home",
                    cond: (context, event) =>
                      event.payload.buttonId === "skip-button",
                  },
                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "check-work-button",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: true,
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                ],
                REVIEWED: [
                  {
                    cond: (context, event) =>
                      event.payload.challengeResponse === "noChanges",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: false,
                          taskFeedback: "no-changes",
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                  {
                    cond: (context, event) =>
                      event.payload.challengeResponse === "tooFar",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: false,
                          taskFeedback: "wrong-location",
                          disabledButtons: ["check-work-button"],
                        }),
                      }),
                      sendUIUpdate,
                      (context, event) => {
                        console.log("REVIEWED_TOO_FAR");
                      },
                    ],
                  },
                  {
                    cond: (context, event) =>
                      event.payload.challengeResponse === "incorrect",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: false,
                          taskFeedback: "incorrect",
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                  {
                    target: "celebrateScreen",
                    cond: (context, event) =>
                      event.payload.challengeResponse === "correct",
                  },
                ],
              },
            },
            celebrateScreen: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "celebrateScreen",
                    visibleButtons: ["next-button"],
                    cardMainText: context.uiState.taskFeedbackMessage,
                    waitingAnimationOn: false,
                    animateLevelUp: true,
                    formerLevel: context.uiState.level - 1,
                  }),
                }),
                "assignDocMetaDataToUIState",
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: {
                  target: "home",
                  cond: (context, event) =>
                    event.payload.buttonId === "next-button",
                },
              },
            },
            uiError: {
              entry: [
                assign({
                  uiState: (context, event: ErrorMessageEvent) => ({
                    ...context.uiState,
                    currentPage: "server-error",
                    errorMessage: event.data.message,
                    waitingAnimationOn: false,
                  }),
                }),
                sendUIUpdate,
              ],
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
            level: context.documentMetaData.level,
            pills: context.documentMetaData.pills,
          }),
        }),
        shiftTopicChallenge: assign({
          documentMetaData: (context) => {
            const { challengeArray, selectedChallengeNumber } =
              context.documentMetaData || {};
            if (challengeArray && challengeArray[selectedChallengeNumber]) {
              challengeArray[selectedChallengeNumber].shift();
            }
            return {
              ...context.documentMetaData,
              challengeArray, // Already modified in-place
              selectedChallengeNumber: -1, // Ensure this is returned as part of the updated object
            };
          },
        }),
        addNewChallengesToChallengeArray: assign({
          documentMetaData: (context) => {
            if (context.documentMetaData.newChallengesReady) {
              const { challengeArray, newChallengesArray } =
                context.documentMetaData;

              // Debugging: Log the initial state

              // Merge corresponding arrays at each index
              const updatedChallengeArray = challengeArray.map((arr, index) => {
                const newArrayAtIndex = newChallengesArray[index] || []; // Handle missing indices // Debugging: Log merging process
                return arr.concat(newArrayAtIndex); // Append the arrays
              });

              return {
                ...context.documentMetaData,
                challengeArray: updatedChallengeArray, // Replace with the updated array
                newChallengesArray: [], // Clear newChallengesArray
                newChallengesReady: false, // Reset the flag
              };
            } else {
              return context.documentMetaData;
            }
          },
        }),
      },
      guards: {
        isChallengeReady: (context) => {
          const documentMetaData = context.documentMetaData || {
            challengeArray: [],
            selectedChallengeNumber: 0,
          }; // Ensure it's not null
          const { challengeArray, selectedChallengeNumber } = documentMetaData;

          // Check if challengeArray is an array and the selected challenge is ready
          return (
            Array.isArray(challengeArray) &&
            challengeArray[selectedChallengeNumber]?.[0]?.ready === true
          );
        },
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
