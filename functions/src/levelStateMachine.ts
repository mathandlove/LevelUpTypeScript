import {
  interpret,
  Interpreter,
  createMachine,
  assign,
  raise,
  stop,
  sendTo,
} from "xstate";

import { LevelUpWebSocket } from "./websocket";
import {
  AppEvent,
  AppContext,
  defaultAppContext,
  defaultAppState,
  ErrorMessageEvent,
} from "./common/appTypes";

import {
  validateToken,
  getOrLoadDocumentMetaData,
  getPersistentDataFileId,
  savePersistentDocData,
  getRubric,
  getRubricArray,
  getOrCreateDefaultRubric,
  savePersistentArrayData,
} from "./services/dataService";
import { DocumentMetaData, Rubric, ChallengeInfo } from "./common/types";
import {
  checkChallengeResponse,
  getCelebration,
  getFailedFeedback,
  getNewChallenge,
  addChallengeDetails,
  formatChallengeResponse,
} from "./services/aiService";
import {
  getFullText,
  highlightChallengeSentence,
  createGoogleSheet,
  updateRubricFromGoogleSheet,
  getOrCreatePaperJournal,
  addLevelToDocumentTitle,
  addEntryToWritingJournal,
} from "./services/googleServices";
import { compareNewSentenceToOldSentence } from "./services/docServices";
import {
  newRubric,
  saveRubricToDatabase,
  installRubric,
} from "./services/dataBaseService";
// Update the ExtendedInterpreter interface to use AppEvent
interface ExtendedInterpreter
  extends Interpreter<AppContext, any, AppEvent, any> {
  stopAll: () => void;
}

const actorStore = new Map<string, ExtendedInterpreter>();
// Store to track actors with explicit typing
export function getOrCreateActor(
  uniqueId: string,
  ws: LevelUpWebSocket
): ExtendedInterpreter {
  const key = `${uniqueId}`;

  if (actorStore.has(key)) {
    return actorStore.get(key)!;
  }

  const baseActor = interpret(createAppMachine(ws))
    .onTransition((state) => {
      console.log(`🔄 State Changed:`, state.value); //[${key}]
    })
    .onStop(() => {
      //console.log(`🛑 [${key}] Actor stopped`);
    })
    .start();

  // Create the extended actor with the stopAll method
  const actor = Object.assign(baseActor, {
    stopAll: () => {
      console.log(`Stopping all activities for actor [${key}]`);
      baseActor.stop();
      actorStore.delete(key);
    },
  }) as unknown as ExtendedInterpreter;

  actorStore.set(key, actor);
  return actor;
}

// 🔹 Create Rubric Machine
// 🔹 MainFlow Machine (Parent)
export function createAppMachine(ws: LevelUpWebSocket) {
  return createMachine<AppContext, AppEvent>(
    {
      predictableActionArguments: true,
      id: "mainFlow",
      initial: "initializeDataStore",
      context: {
        ...defaultAppContext,
        appState: {
          ...defaultAppState,
          ws: ws, // Initialize ws here
        },
      },
      entry: assign({
        appState: (context, event) => ({
          ...context.appState,
          self: (_, __, meta) => meta._sessionid,
        }),
      }),
      on: {
        GIVE_TOKEN: {
          actions: [
            assign({
              appState: (context, event) => ({
                ...context.appState,
                token: event.payload.token,
              }),
            }),
            (context, event) => {
              //console.log("💌 Global GIVE_TOKEN Triggered",event.payload.token );
            },
          ],
        },
      },
      states: {
        error: {
          id: "error",
          entry: [
            (context, event) => {
              console.log("Entered error state");
              console.log(event.type);
            },
            assign({
              uiState: (context, event: ErrorMessageEvent) => ({
                ...context.uiState,
                currentPage: "server-error",
                errorMessage:
                  event.data?.message || "An unknown error occurred.",
                waitingAnimationOn: false,
                visibleButtons: [],
              }),
            }),

            sendUIUpdate,
          ],
          on: {
            error: {
              actions: [
                (context, event) => {
                  console.log("Entered error state");
                },
                assign({
                  uiState: (context, event: ErrorMessageEvent) => ({
                    ...context.uiState,
                    errorMessage: event.data.message,
                  }),
                }),

                sendUIUpdate,
              ],
            },
          },
        },
        initializeDataStore: {
          initial: "waitingForToken",
          states: {
            waitingForToken: {
              on: {
                GIVE_TOKEN: {
                  target: "validatingToken",
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        token: event.payload.token, //I think this is redundant as it's checked globally now.
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
                  actions: assign({
                    appState: (context, event) => ({
                      ...context.appState,
                      domain: event.data, // event.data is the domain string
                    }),
                  }),
                },
                onError: {
                  target: "#error",
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
                  target: "#error",
                },
              },
            },
            loadingDocumentMetaData: {
              invoke: {
                src: getOrLoadDocumentMetaData,

                onDone: {
                  target: "addPaperJournal",
                  actions: [
                    assign({
                      documentMetaData: (context, event) =>
                        event.data.persistentDocData,
                    }),
                  ],
                },

                onError: {
                  target: "#error",
                },
              },
            },
            addPaperJournal: {
              invoke: {
                src: getOrCreatePaperJournal,
                onDone: {
                  target: "childDone",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        paperJournalId: event.data, //This is the ID of the Google Sheet
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
            },
            childDone: {
              type: "final",
            },
          },
          onDone: {
            target: "setupRubric",
          },
        },
        setupRubric: {
          initial: "loadRubricArray",
          states: {
            loadRubricArray: {
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
                  target: ["#error"],
                },
              },
            },
            getOrCreateDefaultRubric: {
              invoke: {
                src: getOrCreateDefaultRubric,
                onDone: {
                  target: "childDone",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        defaultRubric: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: ["#error"],
                },
              },
            },
            childDone: {
              type: "final",
            },
          },
          onDone: {
            target: "idleHome",
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
              assign({
                uiState: (context, event) => ({
                  ...context.uiState,
                  formerLevel: 1, //Always animate on load
                }),
              }),
              sendUIUpdate,
              assign({
                uiState: (context, event) => ({
                  ...context.uiState,
                  formerLevel: context.uiState.level,
                }),
              }),
              savePersistentDocData,
            ],
          },
        },
        idleHome: {
          id: "idleHome",
          entry: [
            //Resets Challenge Loads
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

            //Standard UI Transition
            assign({
              //Resets Challenge Loads
              uiState: (context, event) => ({
                ...context.uiState,
                currentPage: "home-page",
                visibleButtons: [],
              }),
            }),
            sendUIUpdate,
          ],
          on: {
            BUTTON_CLICKED: [
              {
                target: "reflection",
                cond: (context, event) =>
                  event.payload.buttonId === "pill-button" &&
                  event.payload.buttonTitle == -1, // -1 ==reflec t
              },
              {
                target: "challenge",
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
                ],
              },
            ],
            CUSTOMIZE_CLICKED: {
              target: "customization",
            },
          },
        },
        challenge: {
          initial: "setupGoalSelect",
          entry: [
            assign({
              appState: (context) => ({
                ...context.appState,
                flags: {
                  ...context.appState.flags,
                  studentGoal: "",
                  nextPushed: false,
                },
              }),
            }),
          ],
          states: {
            setupGoalSelect: {
              entry: [
                assign({
                  uiState: (context) => ({
                    ...context.uiState,
                    currentPage: "selectGoal-card",
                    visibleButtons: ["back-button"],
                    waitingAnimationOn: false,
                    goalTitles:
                      context.documentMetaData.pills[
                        context.documentMetaData.selectedChallengeNumber
                      ].studentGoalArray,
                  }),
                }),

                sendUIUpdate,
                (context, event) => {
                  //console.log("💌 Goals set up");
                },
              ],
              always: {
                target: "getCurrentText",
              },
            },
            getCurrentText: {
              invoke: {
                id: "getFullText",
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
                onError: {
                  target: "#error",
                },
              },
              on: {
                BUTTON_CLICKED: {
                  target: "childDone",
                  cond: (context, event) =>
                    event.payload.buttonId === "back-button",
                  actions: [stop("getFullText")],
                },
                SELECT_GOAL: {
                  //Attempting to do two states in one, need to delay until challenge is ready.
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        flags: {
                          ...context.appState.flags,
                          studentGoal: event.payload.buttonTitle,
                        },
                      }),
                    }),
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: true,
                        waitingAnimationText: "Reading Your Paper",
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
              },
            },

            getNewChallenge: {
              //Todo if this gets called too many times, we need to kill the program.
              invoke: {
                id: "getNewChallenge",
                src: getNewChallenge,
                onDone: {
                  target: "waitForStudentGoals",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
              on: {
                BUTTON_CLICKED: {
                  target: "childDone",
                  cond: (context, event) =>
                    event.payload.buttonId === "back-button",
                  actions: [stop("getNewChallenge")],
                },
                SELECT_GOAL: {
                  //Attempting to do two states in one, need to delay until challenge is ready.
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        flags: {
                          ...context.appState.flags,
                          studentGoal: event.payload.buttonTitle,
                        },
                      }),
                    }),
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: true,
                        waitingAnimationText: "Reading Your Paper",
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
              },
            },
            waitForStudentGoals: {
              always: {
                target: "getChallengeDetails",
                cond: (context, event) =>
                  context.appState.flags.studentGoal !== "",
              },
              on: {
                BUTTON_CLICKED: {
                  target: "childDone",
                  cond: (context, event) =>
                    event.payload.buttonId === "back-button",
                },
                SELECT_GOAL: {
                  //Attempting to do two states in one, need to delay until challenge is ready.
                  target: "getChallengeDetails",
                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        flags: {
                          ...context.appState.flags,
                          studentGoal: event.payload.buttonTitle,
                        },
                      }),
                    }),
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: true,
                        waitingAnimationText: "Reading Your Paper",
                      }),
                    }),
                    sendUIUpdate,
                  ],
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
                      studentGoal: context.appState.flags.studentGoal,
                    },
                  }),
                }),
              ],
              invoke: {
                id: "addChallengeDetails",
                src: addChallengeDetails,
                onDone: {
                  target: "validateSentenceCoords",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
            },
            validateSentenceCoords: {
              always: [
                {
                  target: "#error",
                  cond: (context, event) => {
                    if (
                      (context.documentMetaData.currentChallenge
                        ?.currentSentenceCoordinates.startIndex === -1 ||
                        context.documentMetaData.currentChallenge
                          ?.currentSentenceCoordinates.endIndex === -1) &&
                      context.appState.challengeRetryCount > 1 //2 strikes and you're out
                    ) {
                      return true;
                    }
                  },
                  actions: raise({
                    type: "error",
                    data: {
                      name: "Too many Challenge Attempt Retries",
                      message:
                        "It looks like your document is formatted in a way that we can't find sentences to edit. This can happen if you have inappropriate content in your document or you have a strangely formatted document. Please contact support if this problem persists.",
                    },
                  }),
                },
                {
                  target: "getCurrentText",
                  cond: (context, event) => {
                    if (
                      context.documentMetaData.currentChallenge
                        ?.currentSentenceCoordinates.startIndex === -1 ||
                      context.documentMetaData.currentChallenge
                        ?.currentSentenceCoordinates.endIndex === -1
                    ) {
                      return true;
                    }
                  },
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: undefined,
                      }),
                    }),
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        challengeRetryCount:
                          context.appState.challengeRetryCount + 1, //Increment the retry count
                      }),
                    }),
                  ],
                },
                {
                  target: "highlightText",

                  actions: [
                    assign({
                      appState: (context, event) => ({
                        ...context.appState,
                        challengeRetryCount: 0, //Challenge Successful, reset retry count
                      }), // Increment the retry count
                    }),
                  ],
                },
              ],
            },

            highlightText: {
              entry: assign((context, event) => {
                const startIndex =
                  context.documentMetaData?.currentChallenge
                    ?.currentSentenceCoordinates.startIndex;
                //console.log("highlight start " + startIndex);
                if (startIndex !== undefined) {
                  ws = context.appState.ws; // Ensure ws is defined
                  if (ws?.sendMessage) {
                    ws.sendMessage({
                      type: "HIGHLIGHT",
                      payload: startIndex,
                    });
                  }
                }

                return context;
              }),

              invoke: {
                id: "highlightChallengeSentence",
                src: highlightChallengeSentence,
                onDone: {
                  target: "AiFeelAndFormatChallenge",
                },
                onError: {
                  target: "#error",
                },
              },
            },
            AiFeelAndFormatChallenge: {
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
              ],
              invoke: {
                id: "formatChallengeResponse",
                src: formatChallengeResponse,
                onDone: {
                  target: "waitForNextButton",
                  actions: assign({
                    documentMetaData: (context, event) => {
                      // Extract challenge data from the event
                      const challenge = event.data; // Assuming event contains challenge data
                      return {
                        ...context.documentMetaData,
                        currentChallenge: challenge, // Correctly assign challenge object
                      };
                    },
                  }),
                },
                onError: {
                  target: "#error",
                },
              },
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "childDone",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                    actions: [stop("formatChallengeResponse")],
                  },
                  {
                    cond: (context, event) =>
                      event.payload.buttonId === "next-button",
                    actions: [
                      assign({
                        appState: (context, event) => ({
                          ...context.appState,
                          flags: {
                            ...context.appState.flags,
                            nextPushed: true,
                          },
                        }),
                      }),
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: true,
                          waitingAnimationText: "Reading Your Paper",
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                ],
              },
            },
            waitForNextButton: {
              always: {
                target: "showChallengeIdle",
                cond: (context, event) => {
                  return context.appState.flags.nextPushed;
                },
              },
              on: {
                BUTTON_CLICKED: [
                  {
                    target: "childDone",
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "showChallengeIdle",
                    cond: (context, event) =>
                      event.payload.buttonId === "next-button",
                    actions: [
                      assign({
                        appState: (context, event) => ({
                          ...context.appState,
                          flags: {
                            ...context.appState.flags,
                            nextPushed: true,
                          },
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                ],
              },
            },
            showChallengeIdle: {
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
                  }),
                }),
                sendUIUpdate,
                assign({
                  //Once a warning has been sent, do not send it again.
                  uiState: (context, event) => ({
                    ...context.uiState,
                    taskFeedback: undefined,
                  }),
                }),
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["childDone"],
                    cond: (context, event) =>
                      event.payload.buttonId === "skip-button",
                  },
                  {
                    target: "getUpdatedFullText",
                    cond: (context, event) =>
                      event.payload.buttonId === "check-work-button",
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: true,
                          waitingAnimationText: "Reading Your Changes",
                        }),
                      }),
                      sendUIUpdate,
                    ],
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
                onError: {
                  target: "#error",
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
                  target: "showChallengeIdle",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedback: "no-changes",
                      }),
                    }),
                  ],
                },
                {
                  cond: (context) =>
                    context.documentMetaData.currentChallenge
                      ?.challengeResponse === "tooFar",
                  target: "showChallengeIdle",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedback: "wrong-location",
                        buttonsDisabled: ["check-work-button"],
                      }),
                    }),
                  ],
                },
              ],
            },
            getAIJudgement: {
              invoke: {
                src: checkChallengeResponse,
                onDone: {
                  target: "checkChallengeResponse",
                  actions: assign({
                    uiState: (context, event) => ({
                      ...context.uiState,
                      taskFeedback: event.data,
                    }),
                  }),
                },
                onError: {
                  target: "#error",
                },
              },
            },
            checkChallengeResponse: {
              always: [
                {
                  target: "getCelebration",
                  cond: (context) => context.uiState.taskFeedback === "correct",
                },
                {
                  target: "getFailedFeedback",
                  cond: (context) =>
                    context.uiState.taskFeedback === "incorrect",
                },
              ],
            },
            getCelebration: {
              invoke: {
                src: getCelebration,
                onDone: {
                  target: "levelUpTopic",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedbackMessage: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
            },
            levelUpTopic: {
              always: [
                {
                  target: "#celebrationScreen",
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
                    "assignDocMetaDataToUIState",
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        formerLevel: context.uiState.level - 1,
                      }),
                    }),
                    (context, event) => {
                      const today = new Date();
                      const formattedDate = today
                        .toLocaleDateString("en-US", {
                          year: "2-digit",
                          month: "2-digit",
                          day: "2-digit",
                        })
                        .replace(/\//g, "/"); // Format date as "MM/DD/YY"

                      const challenge =
                        context.documentMetaData.currentChallenge;

                      if (
                        !challenge ||
                        !challenge.modifiedSentences?.length ||
                        !challenge.aiRawFeedback
                      ) {
                        console.warn("❌ No challenge data found.");
                        return;
                      }

                      const challengeReflections = [
                        {
                          definition: "Original Text:",
                          text: challenge.modifiedSentences[0] || "",
                        },
                        {
                          definition: "Challenge:",
                          text: challenge.aiRawFeedback || "",
                        },
                        {
                          definition: "Student Response:",
                          text: challenge.modifiedSentences[1] || "",
                        },
                      ];

                      // Process wrong feedback loop
                      if (challenge.wrongFeedback?.length) {
                        for (
                          let i = 0;
                          i < challenge.wrongFeedback.length;
                          i++
                        ) {
                          challengeReflections.push({
                            definition:
                              "Incorrect - Request for Additional Changes:",
                            text: challenge.wrongFeedback[i] || "",
                          });

                          if (challenge.modifiedSentences[i + 2]) {
                            challengeReflections.push({
                              definition: "Updated Response:",
                              text: challenge.modifiedSentences[i + 2] || "",
                            });
                          }
                        }
                      }
                      const selectedChallenge =
                        context.documentMetaData.pills[
                          context.documentMetaData.selectedChallengeNumber
                        ];
                      return addEntryToWritingJournal(
                        context,
                        formattedDate + " " + selectedChallenge.title,
                        challengeReflections,
                        "challenge"
                      );
                    },
                  ],
                },
              ],
            },
            getFailedFeedback: {
              invoke: {
                src: getFailedFeedback,
                onDone: {
                  target: "showChallengeIdle",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        taskFeedbackMessage: event.data,
                      }),
                    }),
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        currentChallenge: {
                          ...context.documentMetaData.currentChallenge,
                          wrongFeedback: [
                            ...(context.documentMetaData.currentChallenge
                              ?.wrongFeedback || []),
                            event.data,
                          ],
                        },
                      }),
                    }),
                  ],
                },
              },
            },
            childDone: {
              type: "final",
            },
          },
          onDone: {
            target: "idleHome",
          },
        },
        customization: {
          initial: "customizeHome",
          states: {
            customizeHome: {
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
                //Cleanup
                assign({
                  documentMetaData: (context, event) => ({
                    ...context.documentMetaData,
                    tempNewRubric: undefined,
                  }),
                }),
                sendUIUpdate,
              ],

              on: {
                BUTTON_CLICKED: [
                  {
                    target: "childDone",

                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "customizeNew",
                    cond: (context, event) =>
                      event.payload.buttonId === "new-rubric-button",
                  },
                  {
                    target: "importNewRubric",
                    cond: (context, event) =>
                      event.payload.buttonId === "load-rubric-button",
                  },
                  {
                    target: ["initializeEditRubric"],
                    cond: (context, event) =>
                      event.payload.buttonId === "edit-rubric-button",
                  },
                  {
                    //No transition as we need the popup to be disabled for 5 seconds
                    target: "shareRubricDisplay",
                    cond: (context, event) =>
                      event.payload.buttonId === "share-rubric-button",
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

                          //console.log("💫 setRubricID: ", newRubricID);

                          const newRubric = getRubric(context, newRubricID);
                          const updatedDocumentMetaData = {
                            ...context.documentMetaData,
                            currentRubricID: newRubricID,
                            ...unpackRubric(context, newRubric), // ✅ Pills get updated here
                          };

                          //console.log(
                          //   "💫 Pills updated for rubric: ",
                          //   newRubric.title
                          // );

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

                      sendUIUpdate,
                      savePersistentDocData,
                    ],
                  },
                ],
              },
            },
            importNewRubric: {
              entry: [
                assign({
                  uiState: (context) => ({
                    ...context.uiState,
                    waitingAnimationOn: true,
                    waitingAnimationText: "Importing Rubric...",
                  }),
                }),
                sendUIUpdate,
              ],
              invoke: {
                src: async (context, event) => {
                  if (event.type !== "BUTTON_CLICKED") {
                    throw new Error("Unexpected event type");
                  }
                  const importId = event.payload.importDocumentId;
                  if (!importId) {
                    throw new Error("Missing importDocumentId");
                  }
                  return installRubric(importId);
                },

                onDone: {
                  target: "saveNewRubric",
                  actions: assign({
                    documentMetaData: (context, event) => ({
                      ...context.documentMetaData,
                      tempNewRubric: event.data,
                    }),
                  }),
                },
                onError: {
                  target: "#error",
                },
              },
            },

            shareRubricDisplay: {
              entry: [
                assign((context) => {
                  const rubric = getRubric(
                    context,
                    context.documentMetaData.currentRubricID
                  );
                  //console.log("💫 Sharing Rubric: ", rubric);

                  return {
                    uiState: {
                      ...context.uiState,
                      currentPage: "share-card",
                      waitingAnimationOn: false,
                      visibleButtons: ["back-button"],
                      currentRubricName: rubric.title,
                      currentRubricId: rubric.databaseID,
                    },
                  };
                }),
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: {
                  target: "customizeHome",
                  cond: (context, event) =>
                    event.payload.buttonId === "back-button",
                },
              },
            },

            initializeEditRubric: {
              entry: [
                assign({
                  documentMetaData: (context, event) => ({
                    ...context.documentMetaData,
                    tempNewRubric: getRubric(
                      context,
                      context.documentMetaData.currentRubricID
                    ),
                  }),
                }),
                sendUIUpdate,
              ],
              always: {
                target: "customizeNew",
              },
            },

            customizeNew: {
              exit: stop("createNewRubricTask"),

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
                //cleanup:
                assign({
                  appState: (context, event) => ({
                    ...context.appState,
                    flags: {
                      ...context.appState.flags,
                      nextPushed: false,
                    },
                  }),
                }),
                sendUIUpdate,
              ],

              invoke: {
                id: "createNewRubricTask",
                src: grabOrCreateTempRubricAndSheet,
                onDone: {
                  actions: [
                    () => {
                      // console.log("🔹 New Rubric Created");
                    },
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),
                    sendTo((context) => context.self, "NEW_RUBRIC_READY"), //Trigger state change with a CONDITIONAL
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
              on: {
                NEW_RUBRIC_READY: {
                  cond: (context, event) => context.appState.flags.nextPushed,
                  target: "waitForRubricSave",
                },

                BUTTON_CLICKED: [
                  {
                    target: "customizeHome",

                    cond: (context, event) =>
                      event.payload.buttonId === "back-button",
                  },
                  {
                    target: "waitForRubricSave",
                    cond: (context, event) =>
                      event.payload.buttonId === "start-edits-button" &&
                      context.documentMetaData.tempNewRubric != undefined,
                  },
                  {
                    //Ready to go once rubric is created
                    cond: (context, event) =>
                      event.payload.buttonId === "start-edits-button" &&
                      context.documentMetaData.tempNewRubric == undefined,
                    actions: [
                      assign({
                        appState: (context, event) => ({
                          ...context.appState,
                          flags: {
                            ...context.appState.flags,
                            nextPushed: true,
                          },
                        }),
                      }),
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          waitingAnimationOn: true,
                          waitingAnimationText: "Creating New Rubric",
                        }),
                      }),
                      sendUIUpdate,
                    ],
                  },
                ],
              },
            },

            waitForRubricSave: {
              entry: [
                assign({
                  uiState: (context, event) => ({
                    ...context.uiState,
                    waitingAnimationOn: false,
                    visibleButtons: ["save"],
                    cardMainText:
                      "You should have automatically been redirected to your new rubric. Once finished, click save here, to save your rubric in the Level Up System.",
                  }),
                }),
                (context) =>
                  sendExternalPageToOpen(
                    context,
                    `https://docs.google.com/spreadsheets/d/${context.documentMetaData.tempNewRubric?.googleSheetID}/edit?usp=sharing`
                  ),
                sendUIUpdate,
              ],
              on: {
                BUTTON_CLICKED: {
                  target: "updateNewRubric",
                  cond: (context, event) => event.payload.buttonId === "save",
                  actions: [
                    assign({
                      uiState: (context, event) => ({
                        ...context.uiState,
                        waitingAnimationOn: true,
                        waitingAnimationText: "Saving New Rubric",
                      }),
                    }),
                    sendUIUpdate,
                  ],
                },
              },
            },
            updateNewRubric: {
              invoke: {
                src: (context) => {
                  return updateRubricFromGoogleSheet(
                    context,
                    context.documentMetaData.tempNewRubric
                  );
                },

                onDone: {
                  target: "saveNewRubric",
                  actions: [
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),
                  ],
                },
                onError: {
                  target: "#error",
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
                  target: "customizeHome",
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
                  ],
                },
                onError: {
                  target: "#error",
                },
              },
            },
            childDone: {
              type: "final",
            },
          },
          onDone: {
            target: "idleHome",
          },
        },

        reflection: {
          initial: "reflectionQuestions",
          states: {
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
                assign({
                  uiState: (context, event) => {
                    return {
                      ...context.uiState,
                      reflection: {
                        ...context.uiState.reflection,
                        noInputOnSubmit: false, //Once the user has been warned, we need to not warn them again.
                      },
                    };
                  },
                }),
              ],
              on: {
                BUTTON_CLICKED: [
                  {
                    target: ["#idleHome"],
                    //Exited via Back
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button" &&
                      context.uiState.reflection.selectedQuestion === 0,
                    //I used to clear noInputOnSelect but if anything let's just do that in home?
                  },
                  {
                    target: "reflectionQuestions",
                    //User failed to add text - send warning
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
                    //Wants to change old Question
                    cond: (context, event) =>
                      event.payload.buttonId === "back-button" &&
                      context.uiState.reflection.selectedQuestion != 0,
                    actions: [
                      assign({
                        uiState: (context, event) => ({
                          ...context.uiState,
                          reflection: {
                            ...context.uiState.reflection,
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
                    //Reflection Completed
                    target: "processReflection",
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
                              submittedAnswers: updatedAnswers, // Updated arrayquestion
                            },
                          };
                        },
                      }),
                    ],
                  },
                ],
              },
            },
            processReflection: {
              always: {
                target: "childDone",
                actions: [
                  savePersistentDocData,
                  // Generate the title dynamically based on the current date
                  (context, event) => {
                    const today = new Date();
                    const formattedDate = today
                      .toLocaleDateString("en-US", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                      })
                      .replace(/\//g, "/"); // Ensure proper formatting

                    const reflections = context.uiState.reflection.question.map(
                      (question, index) => ({
                        definition: question,
                        text:
                          context.uiState.reflection.submittedAnswers[index] ||
                          "", // Handle empty responses safely
                      })
                    );

                    return addEntryToWritingJournal(
                      context,
                      formattedDate,
                      reflections,
                      "reflection"
                    );
                  },
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
                      const reflectionScoreIndex = updatedPaperScores.findIndex(
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

                  //3. Clear the reflectionTemplate
                  assign({
                    uiState: (context) => ({
                      ...context.uiState,
                      reflection: {
                        ...context.uiState.reflection,
                        selectedQuestion: 0,
                      },
                    }),
                  }),
                ],
              },
            },

            childDone: {
              type: "final",
            },
          },
          onDone: {
            target: "celebrationScreen",
          },
        },
        celebrationScreen: {
          id: "celebrationScreen",
          entry: [
            assign({
              uiState: (context, event) => {
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
            addLevelToDocumentTitle,
          ],
          on: {
            BUTTON_CLICKED: {
              target: "idleHome",
              cond: (context, event) =>
                event.payload.buttonId === "next-button",
            },
          },
        },
      }, //end of MainFlow States
    },

    {
      //Start of Actions
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
              formerLevel: context.documentMetaData.level,
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
    }
  );
}

function sendUIUpdate(context: AppContext) {
  const ws = context.appState.ws;
  if (ws?.sendMessage) {
    ws.sendMessage({
      type: "STATE",
      payload: context.uiState,
    });
  }
}

function unpackRubric(context: AppContext, rubric: Rubric): DocumentMetaData {
  //We are adding a reflection question depending on user's rubric selection on includeAiCopy
  //console.log("📌 Unpacking rubric:", rubric?.title);

  if (!rubric || !rubric.topics) {
    console.error("❌ Error: Could not find rubric or it has no topics.");
    return {
      ...context.documentMetaData,
      pills: [],
    };
  }

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

  let updatedReflection = { ...rubric.reflection };

  if (updatedReflection.copyPercentIncluded) {
    const aiQuestion =
      "How did you use AI in this paper and how was it helpful?";

    if (updatedReflection.question[0] !== aiQuestion) {
      updatedReflection.question = [aiQuestion, ...updatedReflection.question];
    }
    updatedReflection.selectedQuestion = 0;
  }

  return {
    ...context.documentMetaData,
    paperScores: updatedPaperScores, // 🔹 Updated paper scores, including reflection
    pills: updatedPills,
    reflectionTemplate: updatedReflection, // 🔹 Update with the new reflection template
    rubricLastUpdated: rubric.lastUpdated,
    currentRubricID: rubric.databaseID,
  };
}

async function grabOrCreateTempRubricAndSheet(
  context: AppContext
): Promise<Rubric> {
  //Now checks if rubric in tempNewRubric exists and has a google sheet
  try {
    let rubric: Rubric;
    if (context.documentMetaData.tempNewRubric == undefined) {
      rubric = await newRubric(context);
    } else {
      rubric = context.documentMetaData.tempNewRubric;
    }
    if (rubric.googleSheetID == undefined || rubric.googleSheetID == "") {
      rubric = await createGoogleSheet(context, rubric);
    }

    return rubric;
  } catch (error) {
    console.error("❌ Error creating new rubric and sheet:", error);
    throw error;
  }
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
