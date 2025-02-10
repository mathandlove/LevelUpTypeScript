import {
  interpret,
  Interpreter,
  createMachine,
  assign,
  sendParent,
  stop,
  sendTo,
} from "xstate";

import { LevelUpWebSocket } from "./websocket.js";
import {
  AppEvent,
  AppContext,
  defaultAppContext,
  defaultAppState,
  ErrorMessageEvent,
} from "./common/appTypes.js";

import {
  validateToken,
  getOrLoadDocumentMetaData,
  getPersistentDataFileId,
  savePersistentDocData,
  getRubric,
  getRubricArray,
  getOrCreateDefaultRubric,
  savePersistentArrayData,
} from "../src/services/dataService.js";
import {
  UIState,
  defaultUIState,
  DocumentMetaData,
  Rubric,
  ChallengeInfo,
} from "../src/common/types.js";
import { IncomingWebSocketMessage } from "../src/common/wsTypes.js";
import {
  checkChallengeResponse,
  getCelebration,
  getFailedFeedback,
  getNewChallenge,
  addChallengeDetails,
  formatChallengeResponse,
} from "../src/services/aiService.js";
import { chatGPTKey } from "../src/resources/keys.js";
import { OAuth2Client } from "google-auth-library";
import {
  getFullText,
  highlightChallengeSentence,
  createGoogleSheet,
  updateRubricFromGoogleSheet,
} from "../src/services/googleServices.js";
import { compareNewSentenceToOldSentence } from "../src/services/docServices.js";
import {
  createRubricCopy,
  newRubric,
  saveRubricToDatabase,
} from "../src/services/dataBaseService.js";

// Update the ExtendedInterpreter interface to use AppEvent
interface ExtendedInterpreter
  extends Interpreter<AppContext, any, AppEvent, any> {
  stopAll: () => void;
}

const actorStore = new Map<string, ExtendedInterpreter>();
// Store to track actors with explicit typing
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
      states: {
        error: {
          id: "error",
          entry: [
            (context, event) => {
              console.log("Entered error state");
            },
            assign({
              uiState: (context, event: ErrorMessageEvent) => ({
                ...context.uiState,
                currentPage: "server-error",
                errorMessage: event.data.message,
                waitingAnimationOn: false,
                visibleButtons: [],
              }),
            }),

            sendUIUpdate,
          ],
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
                  target: "childDone",
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
            ],
            CUSTOMIZE_CLICKED: {
              target: "customization",
            },
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
                ],
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
                src: createNewRubricAndSheet,
                onDone: {
                  actions: [
                    () => {
                      console.log("🔹 New Rubric Created");
                    },
                    assign({
                      documentMetaData: (context, event) => ({
                        ...context.documentMetaData,
                        tempNewRubric: event.data,
                      }),
                    }),
                    sendTo((context) => context.self, "NEW_RUBRIC_READY"),
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
                    actions: [stop("createNewRubricTask")],
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

                  //3. Clear the reflectionTemplate
                  assign({
                    uiState: (context) => ({
                      ...context.uiState,
                      reflection: {
                        ...context.uiState.reflection,
                        selectedQuestion: 0,
                        submittedAnswers: [],
                      },
                    }),
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
                  savePersistentDocData,
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
