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
  getRubric,
  getRubricArray,
  getOrCreateDefaultRubric,
  savePersistentArrayData,
} from "./services/dataService.js";
import {
  UIState,
  defaultUIState,
  DocumentMetaData,
  Rubric,
  ChallengeInfo,
} from "./common/types.js";
import { IncomingWebSocketMessage } from "./common/wsTypes.js";
import { LevelUpWebSocket } from "./websocket.js";
import {
  checkChallengeResponse,
  getCelebration,
  getFailedFeedback,
  getNewChallenge,
  addChallengeDetails,
  formatChallengeResponse,
} from "./services/aiService.js";
import { chatGPTKey } from "./resources/keys.js";
import { OAuth2Client } from "google-auth-library";
import {
  getFullText,
  highlightChallengeSentence,
  createGoogleSheet,
  updateRubricFromGoogleSheet,
} from "./services/googleServices.js";
import { compareNewSentenceToOldSentence } from "./services/docServices.js";
import {
  createRubricCopy,
  newRubric,
  saveRubricToDatabase,
} from "./services/dataBaseService.js";
import { AppEvent } from "./common/appEvent.js";

// Initialize the inspector (add this before creating the machine)

interface AppState {
  token: string;
  clientId: string;
  documentId: string;
  ws: LevelUpWebSocket;
  persistentDataFileId: string;
  levelUpFolderId: string;
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

const defaultAppState: AppState = {
  token: "Waiting for token...",
  clientId: "Waiting for clientID",
  documentId: "waiting for documentID",
  ws: null,
  persistentDataFileId: null,
  chatGPTKey,
  GoogleServices: null,
  levelUpFolderId: "",
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
  //cleanup after sending ui update
}

function sendExternalPageToOpen(context: AppContext, url: string) {
  const ws = context.appState.ws;
  if (ws?.sendMessage) {
    ws.sendMessage({
      type: "EXTERNAL_PAGE_TO_OPEN",
      payload: {
        url: url,
      },
    });
  }
}

function sendShareRubricPopup(
  context: AppContext,
  rubricID: string,
  rubricName: string,
  rubricLink: string
) {
  const ws = context.appState.ws;
  if (ws?.sendMessage) {
    ws.sendMessage({
      type: "SHARE_RUBRIC_POPUP",
      payload: {
        rubricID: rubricID,
        rubricName: rubricName,
        rubricLink: rubricLink,
      },
    });
  }
}

async function createNewRubricAndSheet(context: AppContext): Promise<Rubric> {
  try {
    let rubric = await newRubric(context);
    rubric = await createGoogleSheet(context, rubric);
    return rubric;
  } catch (error) {
    console.error("❌ Error creating new rubric and sheet:", error);
    throw error;
  }
}

function unpackRubric(context: AppContext, rubric: Rubric): DocumentMetaData {
  console.log("📌 Unpacking rubric:", rubric?.title);

  if (!rubric || !rubric.topics) {
    console.error("❌ Error: Could not find rubric or it has no topics.");
    return {
      ...context.documentMetaData,
      pills: [],
    };
  }

  const topicsLength = rubric.topics.length;
  let updatedPaperScores = [...context.documentMetaData.paperScores];

  // Ensure all topics have corresponding scores
  rubric.topics.forEach((topic) => {
    let existingScore = updatedPaperScores.find(
      (score) => score.title === topic.title
    );

    if (!existingScore) {
      updatedPaperScores.push({
        title: topic.title,
        current: 0, // Default score
        outOf: undefined,
        description: undefined,
        studentGoalArray: undefined,
      });
    }
  });

  // 🔹 Handle Reflection Paper Score Update
  const reflectionScore = updatedPaperScores.find(
    (score) => score.title === "Reflection"
  );

  if (reflectionScore) {
    reflectionScore.current =
      context.documentMetaData.reflectionTemplate.currentScore;
  } else {
    updatedPaperScores.push({
      title: "Reflection",
      current: context.documentMetaData.reflectionTemplate.currentScore || 0,
      outOf: -1,
      description: "Reflection Score",
      studentGoalArray: undefined,
    });
  }

  rubric.reflection.currentScore =
    context.documentMetaData.reflectionTemplate.currentScore;

  // 🔹 Sync paperScores to topics (pills)

  let updatedPills = rubric.topics.map((topic) => {
    const matchingScore = updatedPaperScores.find(
      (score) => score.title === topic.title
    );
    return {
      ...topic,
      current: matchingScore ? matchingScore.current : 0,
    };
  });

  return {
    ...context.documentMetaData,
    paperScores: updatedPaperScores, // 🔹 Updated paper scores, including reflection
    pills: updatedPills,
    reflectionTemplate: rubric.reflection, // 🔹 Update with the new reflection template
    rubricLastUpdated: rubric.lastUpdated,
    currentRubricID: rubric.databaseID,
  };
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
        RubricState: {
          initial: "idle",
          states: {
            idle: {
              on: {
                LOAD_RUBRIC_ARRAY_FROM_PERSISTENT_DATA: {
                  target: "loadingRubricArray",
                },
              },
            },
            loadingRubricArray: {
              invoke: {
                src: getRubricArray, //Returns arrayObject (can be empty now)
                onDone: {
                  target: "getOrCreateDefaultRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        savedRubrics: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },
            getOrCreateDefaultRubric: {
              invoke: {
                src: getOrCreateDefaultRubric,
                onDone: {
                  target: "unpackRubricState",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        defaultRubric: event.data,
                      }),
                    }),
                    savePersistentDocData,
                    send({
                      type: "RUBRIC_ARRAY_LOADED",
                    }),
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },
            unpackRubricState: {
              always: [
                {
                  target: "ready",

                  actions: [
                    assign({
                      documentMetaData: (context: AppContext) => {
                        const newRubric = getRubric(
                          context,
                          context.documentMetaData.currentRubricID
                        );
                        return {
                          ...context.documentMetaData,
                          ...unpackRubric(context, newRubric),
                        };
                      },
                    }),
                    "assignDocMetaDataToUIState",
                    sendUIUpdate,
                  ],
                },

                {
                  target: "ready",
                },
              ],
            },

            ready: {
              on: {
                CREATE_RUBRIC_COPY: {
                  target: "createRubricCopy",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempImportRubricId: event.payload.importDocumentId,
                      }),
                    }),
                  ],
                },
                CREATE_NEW_RUBRIC: "createNewRubric",
                CREATE_TEMP_GOOGLE_SHEET: "createTempGoogleSheet",
              },
            },

            createRubricCopy: {
              invoke: {
                src: (context) =>
                  createRubricCopy(
                    context,
                    context.documentMetaData.tempImportRubricId
                  ),
                onDone: {
                  target: "saveNewRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                        tempImportRubricId: undefined,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "ready",
                  actions: [
                    (context, event) => {
                      console.log("Error in createRubricCopy");
                    },
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,

                        tempNewRubric: undefined,
                        tempImportRubricId: undefined,
                      }),
                    }),
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        importError: "Rubric does not exist.",
                        waitingAnimationOn: false,
                      }),
                    }),
                    sendUIUpdate,
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        importError: "",
                      }),
                    }),
                  ],
                },
              },
            },

            createTempGoogleSheet: {
              invoke: {
                src: (context) =>
                  createGoogleSheet(
                    context,
                    context.documentMetaData.tempNewRubric
                  ),
                onDone: {
                  target: "waitingForUpdateRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),
                    send({
                      type: "NEW_RUBRIC_AND_SHEET_CREATED",
                    }),
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },

            createNewRubric: {
              invoke: {
                src: createNewRubricAndSheet,
                onDone: {
                  target: "waitingForUpdateRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),

                    send({
                      type: "NEW_RUBRIC_AND_SHEET_CREATED",
                    }),
                  ],
                },

                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },
            waitingForUpdateRubric: {
              on: {
                USER_BACK_ON_TAB: {
                  target: "updateRubricFromGoogleSheet",
                },
                BUTTON_CLICKED: {
                  target: "saveNewRubric",
                  cond: (context, event) => event.payload.buttonId === "save",
                },
              },
            },

            updateRubricFromGoogleSheet: {
              invoke: {
                src: (context) => {
                  return updateRubricFromGoogleSheet(
                    context,
                    context.documentMetaData.tempNewRubric
                  );
                },
                onDone: {
                  target: "waitingForUpdateRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),
                    send({
                      type: "NEW_RUBRIC_UPDATED_FROM_GOOGLE_SHEET",
                    }),
                  ],
                },
                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },
            saveNewRubric: {
              entry: [
                assign({
                  documentMetaData: (context, event) => {
                    const updatedRubrics =
                      context.documentMetaData.savedRubrics.some(
                        (rubric) =>
                          rubric.databaseID ===
                          context.documentMetaData.tempNewRubric.databaseID
                      )
                        ? context.documentMetaData.savedRubrics.map((rubric) =>
                            rubric.databaseID ===
                            context.documentMetaData.tempNewRubric.databaseID
                              ? {
                                  ...rubric,
                                  ...context.documentMetaData.tempNewRubric,
                                }
                              : rubric
                          )
                        : [
                            ...context.documentMetaData.savedRubrics,
                            context.documentMetaData.tempNewRubric,
                          ];

                    return {
                      ...context.documentMetaData,
                      savedRubrics: updatedRubrics,
                    };
                  },
                }),
                assign({
                  documentMetaData: (context: AppContext) => {
                    const newRubric = getRubric(
                      context,
                      context.documentMetaData.tempNewRubric.databaseID
                    );
                    return {
                      ...context.documentMetaData,
                      ...unpackRubric(context, newRubric),
                    };
                  },
                }),
                "assignDocMetaDataToUIState",
                send({
                  type: "NEW_RUBRIC_UNPACKED",
                }),
              ],

              invoke: {
                src: async (context) => {
                  const newRubric = await saveRubricToDatabase(
                    context.documentMetaData.tempNewRubric
                  );
                  await savePersistentArrayData(context);
                  return newRubric;
                },

                onDone: {
                  target: "ready",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,

                        rubricLastUpdated:
                          context.documentMetaData.tempNewRubric.lastUpdated,

                        currentRubricID:
                          context.documentMetaData.tempNewRubric.databaseID, //If you create a rubric, you will be assigned to it automatically.
                        tempNewRubric: undefined,
                      }),
                    }),

                    savePersistentDocData,
                    send({
                      type: "NEW_RUBRIC_SAVED",
                    }),
                  ],
                },

                onError: {
                  target: [
                    "#app.UI.uiError",
                    "#app.RubricState.error",
                    "#app.MainFlow.error",
                  ],
                },
              },
            },
            error: {},
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
                  target: ["#app.UI.uiError", "error"],
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
                        levelUpFolderId: event.data.levelUpFolderId,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: ["#app.UI.uiError", "error"],
                },
              },
            },
            loadingDocumentMetaData: {
              invoke: {
                src: getOrLoadDocumentMetaData,

                onDone: {
                  target: "waitingForRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) =>
                        event.data.persistentDocData,
                    }),
                    send({
                      type: "LOAD_RUBRIC_ARRAY_FROM_PERSISTENT_DATA",
                    }),
                  ],
                },

                onError: {
                  target: ["#app.UI.uiError", "error"],
                },
              },
            },

            waitingForRubric: {
              always: {
                cond: (context) => {
                  return context.documentMetaData.defaultRubric !== undefined;
                },
                target: "homeReset",
              },
              on: {
                RUBRIC_ARRAY_LOADED: {
                  target: "homeReset",
                  actions: [
                    send({
                      type: "CREATE_CHALLENGES",
                    }),
                  ],
                },
              },
            },
            homeReset: {
              always: {
                //Could be entry but ui will force us back here when done, and we need to run the reset.
                target: "idleHome",
                actions: [
                  assign({
                    uiState: (context, event) => ({
                      ...context.uiState,
                      waitingAnimationOn: false,
                      mainText: "",
                      goalTitles: undefined,
                    }),
                    documentMetaData: (context, event) => ({
                      ...context.documentMetaData,
                      currentChallenge: undefined, //We make the challenges on the go now!
                      selectedChallengeNumber: undefined,
                    }),
                  }),
                  sendUIUpdate,
                ],
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
                    }), //Start loading text/challenge question + UI needs to go to Motivation screen.
                  ],
                },
                REFLECTION_SELECTED: {
                  target: "idleReflection",
                },

                CUSTOMIZE_CLICKED: {
                  target: "idleCustomize",
                },
              },
            },
            idleCustomize: {
              on: {
                NEW_RUBRIC_UNPACKED: {},

                BUTTON_CLICKED: [
                  {
                    target: "homeReset",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "share-rubric-button",
                    actions: [
                      (context) => {
                        const currentRubric = getRubric(
                          context,
                          context.documentMetaData.currentRubricID
                        );
                        sendShareRubricPopup(
                          context,
                          currentRubric.databaseID,
                          currentRubric.title,
                          "https://www.wonder.io"
                        );
                      },
                    ],
                  },
                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "load-rubric-button",
                    actions: [
                      (context, event) => {
                        console.log(
                          "🥤 Sending CREATE_RUBRIC_COPY",
                          event.payload.importDocumentId
                        );
                      },
                      send((context, event) => ({
                        type: "CREATE_RUBRIC_COPY",
                        payload: {
                          importDocumentId: event.payload.importDocumentId,
                        },
                      })),
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: true,
                        }),
                      }),
                    ],
                  },

                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "rubric-dropdown",
                    actions: [
                      assign({
                        documentMetaData: (context, event) => {
                          const reversedRubrics = [
                            ...context.documentMetaData.savedRubrics,
                          ].reverse();
                          const selectedIndex = event.payload.selectedIndex;

                          const newRubricID =
                            selectedIndex >= reversedRubrics.length
                              ? context.documentMetaData.defaultRubric
                                  ?.databaseID
                              : reversedRubrics[selectedIndex].databaseID;

                          console.log("💫 setRubricID: ", newRubricID);

                          const newRubric = getRubric(context, newRubricID);
                          const updatedDocumentMetaData = {
                            ...context.documentMetaData,
                            currentRubricID: newRubricID,
                            ...unpackRubric(context, newRubric), // ✅ Pills get updated here
                          };

                          console.log(
                            "💫 Pills updated for rubric: ",
                            newRubric.title
                          );

                          return updatedDocumentMetaData;
                        },
                      }),

                      "assignDocMetaDataToUIState",

                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          buttonsDisabled:
                            context.documentMetaData.currentRubricID ===
                            "starterRubric"
                              ? ["edit-rubric-button", "share-rubric-button"]
                              : [],
                        }),
                      }),

                      (context, event) => {
                        console.log(
                          "💫 selectedRubric",
                          context.uiState.selectedRubric,
                          "💫 receivedRubric: ",
                          event.payload.selectedIndex
                        );
                      },

                      sendUIUpdate,
                      savePersistentDocData,
                    ],
                  },
                ],
              },
            },

            updateTextOnChallengeSelected: {
              invoke: {
                src: getFullText,
                onDone: {
                  target: "getNewChallenge",
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

            getNewChallenge: {
              invoke: {
                src: getNewChallenge,
                onDone: {
                  target: "waitForGoalFlag",
                  actions: [
                    (context, event) => {
                      console.log("💫 getNewChallenge: ", event.data);
                    },
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: event.data,
                      }),
                    }),
                  ],
                },
              },
            },
            waitForGoalFlag: {
              always: {
                cond: (context) =>
                  !!context.documentMetaData?.flags?.studentGoal,

                target: "getChallengeDetails",
              },
              on: {
                GOAL_FLAGGED: {
                  target: "getChallengeDetails",
                },
              },
            },

            getChallengeDetails: {
              entry: [
                assign({
                  documentMetaData: (context, event) => ({
                    ...context.documentMetaData,
                    currentChallenge: {
                      ...context.documentMetaData.currentChallenge,
                      studentGoal: context.documentMetaData.flags.studentGoal,
                      flags: {
                        ...context.documentMetaData.flags,
                        studentGoal: undefined,
                      },
                    },
                  }),
                }),
              ],

              invoke: {
                src: addChallengeDetails,

                onDone: {
                  target: "formatChallengeResponse",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: event.data,
                      }),
                    }),
                    send({
                      type: "AI_FEELING_READY",
                    }),
                  ],
                },
              },
            },
            formatChallengeResponse: {
              invoke: {
                src: formatChallengeResponse,
                onDone: {
                  target: "idleOnChallenge",
                  actions: [
                    (context, event) => {
                      console.log("💫 formatChallengeResponse: ", event.data);
                    },
                    assign({
                      documentMetaData: (context, event) => {
                        // Extract challenge data from the event
                        const challenge = event.data; // Assuming event contains challenge data
                        return {
                          ...context.documentMetaData,
                          currentChallenge: challenge, // Correctly assign challenge object
                        };
                      },
                    }),
                    (context, event) => {
                      console.log(
                        "💫 formatChallengeResponse: ",
                        context.documentMetaData.currentChallenge
                      );
                    },
                    send({
                      type: "CHALLENGE_READY",
                    }),
                  ],
                },
              },
            },
            idleOnChallenge: {
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "homeReset",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },

                  {
                    target: "homeReset",
                    cond: (context, event) =>
                      event.payload.buttonId === "skip-button",

                    actions: [
                      assign({
                        documentMetaData: (context, event) => ({
                          ...context.documentMetaData,
                          currentChallenge: undefined,
                        }),
                      }),
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

                    const { documentMetaData } = context;
                    const currentChallenge = documentMetaData.currentChallenge;

                    if (currentChallenge) {
                      // Create an updated challenge object with the modified data
                      const updatedChallenge: ChallengeInfo = {
                        ...currentChallenge,
                        challengeResponse,
                        modifiedSentences,
                        currentSentenceCoordinates: {
                          startIndex: modifiedStartIndex,
                          endIndex: modifiedEndIndex,
                        },
                      };

                      return {
                        ...documentMetaData,
                        currentChallenge: updatedChallenge,
                      };
                    } else {
                      console.warn("No current challenge found.");
                      return documentMetaData; // Return unchanged metadata if no challenge exists
                    }
                  },
                }),
              ],

              always: [
                {
                  cond: (context) =>
                    context.documentMetaData.currentChallenge
                      ?.challengeResponse === "valid",
                  target: "getAIJudgement",
                },
                {
                  cond: (context) =>
                    context.documentMetaData.currentChallenge
                      ?.challengeResponse === "noChanges",

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
                    context.documentMetaData.currentChallenge
                      ?.challengeResponse === "tooFar",

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
                  actions: [],
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
                      //Increase Topic Score and save.
                      documentMetaData: (context) => {
                        const {
                          selectedChallengeNumber,
                          pills,
                          level,
                          paperScores,
                        } = context.documentMetaData;

                        //Change paperScores
                        const pillToUpdate = pills[selectedChallengeNumber];
                        const targetTitle = pillToUpdate.title;
                        const updatedPaperScores = paperScores.map((score) =>
                          score.title === targetTitle
                            ? { ...score, current: (score.current || 0) + 1 } //
                            : score
                        );

                        //Apply paperScores to pills
                        pills.forEach((topic) => {
                          //Change the topic.score to updatedPaperScores.score
                          const existingTopic = updatedPaperScores.find(
                            (score) => score.title === topic.title
                          );
                          if (existingTopic) {
                            topic.current = existingTopic.current;
                          }
                        });

                        return {
                          ...context.documentMetaData,
                          pills: pills,
                          paperScores: updatedPaperScores,
                          level: level + 1,
                        };
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
                  target: "homeReset",
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
                  ],
                },
              },
            },

            //TODO: TAKE INTO ACCOUNT "Ask About Copy Paste"

            idleReflection: {
              on: {
                REFLECTION_SUBMITTED: {
                  target: ["homeReset", "#app.UI.celebrateScreen"],
                  actions: [
                    // 1. Add reflection to documentMetaData.savedReflections
                    assign({
                      documentMetaData: (context) => ({
                        ...context.documentMetaData,
                        savedActivity: {
                          ...context.documentMetaData.savedActivity,
                          savedReflections: [
                            ...context.documentMetaData.savedActivity
                              .savedReflections,
                            {
                              ...context.uiState.reflection, // Add the current reflection
                            },
                          ],
                        },
                      }),
                    }),

                    // 2. Increase the level in the ReflectionTemplate
                    assign({
                      documentMetaData: (context) => {
                        let updatedPaperScores = [
                          ...context.documentMetaData.paperScores,
                        ];

                        // Update Reflection Score in Paper Scores
                        const reflectionScoreIndex =
                          updatedPaperScores.findIndex(
                            (score) => score.title === "Reflection"
                          );

                        if (reflectionScoreIndex > -1) {
                          updatedPaperScores[reflectionScoreIndex].current += 1;
                        } else {
                          updatedPaperScores.push({
                            title: "Reflection",
                            current: 1,
                            outOf: -1,
                            description: "Reflection Score",
                            studentGoalArray: undefined,
                          });
                        }

                        return {
                          ...context.documentMetaData,
                          paperScores: updatedPaperScores,
                          reflectionTemplate: {
                            ...context.documentMetaData.reflectionTemplate,
                            currentScore:
                              context.documentMetaData.reflectionTemplate
                                .currentScore + 1,
                          },
                        };
                      },
                    }),

                    // 3. Turn reflectionTemplate into uiState.reflection

                    // 4. Increase the level in documentMetaData
                    assign({
                      documentMetaData: (context) => ({
                        ...context.documentMetaData,
                        level: context.documentMetaData.level + 1,
                      }),
                    }),

                    //5. Set taskfeebackMessage.
                    assign({
                      uiState: (context) => ({
                        ...context.uiState,
                        taskFeedbackMessage:
                          "Thanks for reflecting on your work! Reflection saved.",
                      }),
                    }),
                    "assignDocMetaDataToUIState",
                    savePersistentDocData,
                    //todo - put reflection on document somewhere.
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
                RUBRIC_ARRAY_LOADED: {
                  actions: [
                    "assignDocMetaDataToUIState",
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
                    //After animation set new default levels.
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        formerLevel: context.uiState.level,
                        animateLevelUp: false,
                      }),
                    }),
                  ],
                },
                CUSTOMIZE_CLICKED: {
                  target: "customizeBase",
                },
                BUTTON_CLICKED: [
                  {
                    target: "selectGoal",
                    cond: (context, event) =>
                      event.payload.buttonId === "pill-button" &&
                      event.payload.buttonTitle !== -1, // -1 ==reflec t
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
                  {
                    target: "reflectionQuestions", // Transition to a loading state
                    cond: (context, event) =>
                      event.payload.buttonId === "pill-button" &&
                      event.payload.buttonTitle == -1, // -1 ==reflec t
                    actions: [
                      assign({
                        //We will load the uiState from defaultReflectio
                        uiState: (context, event) => ({
                          ...context.uiState,
                          reflection: {
                            ...context.uiState.reflection,
                            selectedQuestion: 0, //Start uiQuestions on page1
                          },
                        }),
                      }),
                      sendUIUpdate,
                      send((context, event) => ({
                        type: "REFLECTION_SELECTED",
                      })), // Ensure the action is returned properly
                    ],
                  },
                ],
              },
            },
            selectGoal: {
              entry: [
                assign({
                  uiState: (context) => ({
                    ...context.uiState,
                    currentPage: "selectGoal-card",
                    visibleButtons: ["back-button", "next-button"],
                    goalTitles:
                      context.documentMetaData.pills[
                        context.documentMetaData.selectedChallengeNumber
                      ].studentGoalArray,
                  }),
                }),

                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: {
                  target: ["home", "#app.MainFlow.homeReset"],
                  cond: (context, event) =>
                    event.payload.buttonId === "back-button",
                },

                SELECT_GOAL: {
                  target: "waitingForAIFeel",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        flags: {
                          studentGoal: event.payload.buttonTitle,
                        },
                      }),
                    }),
                    send((context, event) => ({
                      type: "GOAL_FLAGGED",
                    })),
                  ],
                },
              },
            },
            waitingForAIFeel: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    waitingAnimationOn: true,
                  }),
                }),
                sendUIUpdate,
              ],
              always: {
                target: "aiFeel",
                cond: (context, event) =>
                  !!context.documentMetaData?.currentChallenge?.aiFeeling,
              },
              on: {
                AI_FEELING_READY: {
                  target: "aiFeel",
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
                      context.documentMetaData.currentChallenge?.aiFeeling,
                    waitingAnimationOn: false,
                  }),
                }),
                sendUIUpdate,
                highlightChallengeSentence,
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["home", "#app.MainFlow.homeReset"],
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "waitingForChallenge",
                    cond: (context, event) =>
                      event.payload.buttonId === "next-button",
                  },
                ],
              },
            },
            waitingForChallenge: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    waitingAnimationOn: true,
                  }),
                }),
                sendUIUpdate,
              ],
              always: {
                target: "challengeDisplay",
                cond: (context, event) =>
                  !!context.documentMetaData?.currentChallenge
                    ?.formattedFeedback,
              },

              on: {
                CHALLENGE_READY: {
                  target: "challengeDisplay",
                },
              },
            },

            challengeDisplay: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "challenge-card",
                    visibleButtons: ["skip-button", "check-work-button"],
                    waitingAnimationOn: false,
                    cardMainText:
                      context.documentMetaData.currentChallenge
                        ?.formattedFeedback,
                    taskFeedback: undefined,
                  }),
                }),
                (context, event) => {
                  console.log(
                    "💫 challengeDisplay: ",
                    context.documentMetaData.currentChallenge?.formattedFeedback
                  );
                },
                sendUIUpdate,
              ],

              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["home", "#app.MainFlow.homeReset"],
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
                "assignDocMetaDataToUIState",
                assign({
                  uiState: (context, event) => {
                    const rubricTitle = getRubric(
                      context,
                      context.documentMetaData.currentRubricID
                    ).title;

                    return {
                      ...context.uiState,
                      currentPage: "celebrateScreen",
                      visibleButtons: ["next-button"],
                      cardMainText: context.uiState.taskFeedbackMessage,
                      waitingAnimationOn: false,
                      animateLevelUp: true,
                      formerLevel: context.uiState.level - 1,
                      //I used to assign rubricName here, but it didn't make sense why?
                    };
                  },
                }),
                sendUIUpdate,

                //After animation set new default levels.
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    formerLevel: context.uiState.level,
                    animateLevelUp: false,
                  }),
                }),
              ],
              on: {
                BUTTON_CLICKED: {
                  target: "home",
                  cond: (context, event) =>
                    event.payload.buttonId === "next-button",
                },
              },
            },
            reflectionQuestions: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "reflection-card",
                    visibleButtons:
                      context.uiState.reflection.selectedQuestion ===
                      context.uiState.reflection.question.length - 1
                        ? ["back-button", "submit-button"]
                        : ["back-button", "next-button"],
                  }),
                }),
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["home", "#app.MainFlow.homeReset"],
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button" &&
                      context.uiState.reflection.selectedQuestion === 0,
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          reflection: {
                            ...context.uiState.reflection,
                            noInputOnSubmit: false,
                          },
                        }),
                      }),
                      send((context, event) => ({
                        type: "BACK_TO_HOME",
                      })), // Ensure the action is returned properly
                    ],
                  },
                  {
                    target: "reflectionQuestions",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button" &&
                      context.uiState.reflection.selectedQuestion != 0,
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          reflection: {
                            ...context.uiState.reflection,
                            noInputOnSubmit: false,
                            selectedQuestion:
                              context.uiState.reflection.selectedQuestion - 1,
                            visibleButtons: ["back-button", "next-button"],
                          },
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                  {
                    target: "reflectionQuestions",
                    cond: (context, event) =>
                      (event.payload.buttonId === "next-button" ||
                        event.payload.buttonId === "submit-button") &&
                      event.payload.textResponse.length === 0,
                    actions: [
                      assign({
                        uiState: (context, event) => {
                          return {
                            ...context.uiState,
                            reflection: {
                              ...context.uiState.reflection,
                              noInputOnSubmit: true,
                            },
                          };
                        },
                      }),
                      sendUIUpdate,
                    ],
                  },
                  {
                    target: "reflectionQuestions",
                    cond: (context, event) =>
                      event.payload.buttonId === "next-button" &&
                      event.payload.textResponse.length > 0,
                    actions: [
                      assign({
                        uiState: (context, event) => {
                          const selectedQuestionIndex =
                            context.uiState.reflection.selectedQuestion;

                          // Copy existing submittedAnswers array
                          const updatedAnswers = [
                            ...context.uiState.reflection.submittedAnswers,
                          ];

                          // Add or update the response at the selected index
                          updatedAnswers[selectedQuestionIndex] =
                            event.payload.textResponse;

                          return {
                            ...context.uiState,
                            reflection: {
                              ...context.uiState.reflection,
                              noInputOnSubmit: false,
                              submittedAnswers: updatedAnswers, // Updated array
                              selectedQuestion: selectedQuestionIndex + 1, // Move to the next question
                            },
                          };
                        },
                      }),
                      sendUIUpdate,
                    ],
                  },
                  {
                    //target will be sent via MainFlow
                    cond: (context, event) =>
                      event.payload.buttonId === "submit-button" &&
                      event.payload.textResponse.length > 0,
                    actions: [
                      assign({
                        uiState: (context, event) => {
                          const selectedQuestionIndex =
                            context.uiState.reflection.selectedQuestion;

                          // Copy existing submittedAnswers array
                          const updatedAnswers = [
                            ...context.uiState.reflection.submittedAnswers,
                          ];

                          // Add or update the response at the selected index
                          updatedAnswers[selectedQuestionIndex] =
                            event.payload.textResponse;

                          return {
                            ...context.uiState,
                            reflection: {
                              ...context.uiState.reflection,
                              noInputOnSubmit: false,
                              submittedAnswers: updatedAnswers, // Updated array
                            },
                          };
                        },
                      }),
                      send((context, event) => ({
                        type: "REFLECTION_SUBMITTED",
                      })),
                      sendUIUpdate, //Todo should probably be move to mainflow
                    ],
                  },
                ],
              },
            },
            customizeBase: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "customize-card",
                    waitingAnimationOn: false,
                    visibleButtons: [
                      "back-button",
                      "edit-rubric-button",
                      "share-rubric-button",
                    ],
                    buttonsDisabled:
                      context.documentMetaData.currentRubricID ===
                      "starterRubric"
                        ? ["edit-rubric-button", "share-rubric-button"]
                        : [],
                  }),
                }),
                sendUIUpdate,
              ],

              on: {
                NEW_RUBRIC_UNPACKED: {
                  target: "customizeBase",
                },
                BUTTON_CLICKED: [
                  {
                    target: ["home", "#app.MainFlow.homeReset"],

                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },

                  {
                    target: [
                      "customizeNew",
                      "#app.RubricState.waitingForUpdateRubric",
                    ],
                    cond: (context, event) =>
                      event.payload.buttonId === "edit-rubric-button" &&
                      getRubric(
                        context,
                        context.documentMetaData.currentRubricID
                      ).googleSheetID != undefined,
                    actions: [
                      assign({
                        documentMetaData: (context, event) => ({
                          ...context.documentMetaData,
                          tempNewRubric: getRubric(
                            context,
                            context.documentMetaData.currentRubricID
                          ),
                        }),
                      }),
                      //if tempNewRubric.googleSheetID is undefined, we need to send CREATE_TEMP_GOOGLE_SHEET
                      sendUIUpdate,
                    ],
                  },
                  {
                    target: ["customizeNew"],
                    cond: (context, event) =>
                      event.payload.buttonId === "edit-rubric-button" &&
                      getRubric(
                        context,
                        context.documentMetaData.currentRubricID
                      ).googleSheetID === undefined,
                    actions: [
                      assign({
                        documentMetaData: (context, event) => ({
                          ...context.documentMetaData,
                          tempNewRubric: getRubric(
                            context,
                            context.documentMetaData.currentRubricID
                          ),
                        }),
                      }),
                      send((context, event) => ({
                        type: "CREATE_TEMP_GOOGLE_SHEET",
                      })),
                      sendUIUpdate,
                    ],
                  },

                  {
                    target: "customizeNew",
                    cond: (context, event) =>
                      event.payload.buttonId === "new-rubric-button",
                    actions: [
                      assign({
                        documentMetaData: (context, event) => ({
                          ...context.documentMetaData,
                          tempNewRubric: undefined,
                        }),
                      }),
                      send((context, event) => ({
                        type: "CREATE_NEW_RUBRIC",
                      })),
                      sendUIUpdate,
                    ],
                  },

                  {
                    actions: [
                      (context, event) => {
                        console.log(event.payload.buttonId);
                      },
                    ],
                  },
                ],
              },
            },
            customizeLoadRubric: {},

            customizeNew: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    currentPage: "customize-card-edit-newWindow",
                    cardMainText:
                      "You will be using Google Sheets to edit and update your rubric. Once you are done editing, return here to save your changes.",
                    visibleButtons: ["back-button", "start-edits-button"],
                  }),
                }),
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["customizeBase", "#app.RubricState.ready"],
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                    actions: [
                      assign({
                        documentMetaData: (context, event) => ({
                          ...context.documentMetaData,
                          tempNewRubric: undefined,
                        }),
                      }),
                    ],
                  },

                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "start-edits-button",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn:
                            context.documentMetaData.tempNewRubric
                              ?.googleSheetID === undefined, // Only wait if no sheet exists
                          visibleButtons: context.documentMetaData.tempNewRubric
                            ? ["save"]
                            : ["back-button", "start-edits-button"], // Show "save" if sheet exists
                        }),
                      }),
                      (context, event) => {
                        if (
                          context.documentMetaData.tempNewRubric != undefined
                        ) {
                          sendExternalPageToOpen(
                            context,
                            `https://docs.google.com/spreadsheets/d/${context.documentMetaData.tempNewRubric?.googleSheetID}/edit?usp=sharing`
                          );
                        }
                      },
                      sendUIUpdate,
                    ],
                  },
                ],

                USER_BACK_ON_TAB: {
                  target: "updatingRubric", //This will also call our Rubric State (LOOK UP!)
                  //I had a weird contion here to make sure the Rubric was saved?
                },

                NEW_RUBRIC_AND_SHEET_CREATED: {
                  cond: (context, event) =>
                    context.uiState.waitingAnimationOn === true, //If loaded before button press do not load.
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: false,
                        visibleButtons: ["save"],
                      }),
                    }),
                    (context) =>
                      sendExternalPageToOpen(
                        context,
                        `https://docs.google.com/spreadsheets/d/${context.documentMetaData.tempNewRubric?.googleSheetID}/edit?usp=sharing`
                      ),
                    sendUIUpdate,
                  ],
                },
              },
            },
            updatingRubric: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    waitingAnimationOn: true,
                  }),
                }),
                sendUIUpdate,
              ],
              on: {
                NEW_RUBRIC_UPDATED_FROM_GOOGLE_SHEET: {
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: false,
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
                USER_BACK_ON_TAB: {
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
                BUTTON_CLICKED: {
                  cond: (context, event) => event.payload.buttonId === "save",
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
                NEW_RUBRIC_SAVED: {
                  target: "customizeBase",
                  actions: [
                    "assignDocMetaDataToUIState",
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: false,
                      }),
                    }),
                    sendUIUpdate,
                  ],
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
          uiState: (context: AppContext, event: any) => {
            const reversedRubrics = [
              ...context.documentMetaData.savedRubrics,
            ].reverse(); // Avoid mutating the original array

            const selectedIndex = reversedRubrics.findIndex(
              (rubric) =>
                rubric.databaseID === context.documentMetaData.currentRubricID
            );

            const updatedUIState = {
              ...context.uiState,
              lastUpdated: new Date().toISOString(),
              level: context.documentMetaData.level,
              pills: context.documentMetaData.pills,
              reflection: {
                ...context.uiState.reflection,
                ...context.documentMetaData.reflectionTemplate,
              },
              listOfAvailableRubrics: [
                ...reversedRubrics.map((rubric) => rubric.title),
                "Default Rubric",
              ],
              selectedRubric:
                selectedIndex !== -1 ? selectedIndex : reversedRubrics.length,
            };
            return updatedUIState;
          },
        }),
      },
      guards: {},
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
