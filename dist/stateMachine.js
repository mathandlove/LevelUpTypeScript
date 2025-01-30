import { createMachine, assign, interpret, send, } from "xstate";
import { validateToken, getOrLoadDocumentMetaData, getPersistentDataFileId, savePersistentDocData, } from "./services/dataService.js";
import { defaultUIState, } from "./common/types.js";
import { addChallengesToChallengeArrays, addChallengeDetailsToChallengeArray, checkChallengeResponse, getCelebration, getFailedFeedback, } from "./services/aiService.js";
import { chatGPTKey, StarterLevelUpRubricId } from "./resources/keys.js";
import { getFullText, highlightChallengeSentence, } from "./services/googleServices.js";
import { compareNewSentenceToOldSentence, loadRubric, updateTextCoordinates, } from "./services/docServices.js";
const defaultDocState = "waiting for documentID";
const defaultAppState = {
    token: "Waiting for token...",
    clientId: "Waiting for clientID",
    documentId: "waiting for documentID",
    ws: null,
    persistentDataFileId: null,
    chatGPTKey,
    GoogleServices: null,
    levelUpFolderId: "",
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
    //cleanup after sending ui update
}
// Define a function to create the machine with initial context
export function createAppMachine(ws) {
    return createMachine({
        id: "app",
        type: "parallel",
        predictableActionArguments: true,
        context: Object.assign(Object.assign({}, defaultAppContext), { appState: Object.assign(Object.assign({}, defaultAppState), { ws: ws }) }),
        states: {
            ChallengeCreator: {
                initial: "idle",
                states: {
                    idle: {
                        on: {
                            CREATE_CHALLENGES: {
                                target: "createChallenges",
                            },
                            LOAD_RUBRIC: {
                                target: "loadRubric",
                            },
                        },
                    },
                    //todo this is the wrong state but using it to test loading.
                    loadRubric: {
                        invoke: {
                            src: loadRubric,
                            onDone: {
                                target: "idle",
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { newChallengesArray: event.data })),
                                    }),
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { newChallengesArray: event.data, newChallengesReady: true })),
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
                                        appState: (context, event) => (Object.assign(Object.assign({}, context.appState), { persistentDataFileId: event.data.persistentDataFileId, GoogleServices: event.data.GoogleServices, levelUpFolderId: event.data.levelUpFolderId })),
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
                                target: "checkForRubric",
                                actions: [
                                    assign({
                                        documentMetaData: (context, event) => event.data.persistentDocData,
                                    }),
                                    (context, event) => console.log("persistentDataFileId: " + event.data.persistentDocData),
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
                    checkForRubric: {
                        always: [
                            {
                                cond: (context) => context.documentMetaData.rubricInfo.loadRubricId ===
                                    StarterLevelUpRubricId,
                                target: "waitingForRubric",
                                actions: [
                                    send({
                                        type: "LOAD_RUBRIC",
                                    }),
                                ],
                            },
                            { target: "updateTextInitial" },
                        ],
                    },
                    waitingForRubric: {
                        on: {
                            RUBRIC_LOADED: {
                                target: "updateTextInitial",
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { textBeforeEdits: context.documentMetaData.currentText, currentText: event.data })),
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { selectedChallengeNumber: event.payload.topicNumber })),
                                    }),
                                    (context, event) => console.log("challenge number selected: " +
                                        context.documentMetaData.selectedChallengeNumber),
                                ],
                            },
                            REFLECTION_SELECTED: {
                                target: "idleReflection",
                            },
                            BACK_TO_HOME: {
                                target: "idleHome",
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { textBeforeEdits: context.documentMetaData.currentText, currentText: event.data })),
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
                            src: (context) => Promise.resolve(updateTextCoordinates(context)),
                            onDone: {
                                target: "checkForChallenges",
                                actions: [
                                    assign({
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { challengeArray: event.data })),
                                    }),
                                ],
                            },
                        },
                    },
                    checkForChallenges: {
                        always: [
                            {
                                cond: (context) => {
                                    var _a;
                                    const { challengeArray, selectedChallengeNumber } = context.documentMetaData || {};
                                    // Ensure challengeArray and selectedChallengeNumber are valid
                                    if (!Array.isArray(challengeArray) || // Validate challengeArray is an array
                                        !Array.isArray(challengeArray[selectedChallengeNumber]) // Validate nested array
                                    ) {
                                        return false; // Safely return false if data is invalid
                                    }
                                    // Safely access sentenceStartIndex and compare
                                    const challenge = (_a = challengeArray[selectedChallengeNumber]) === null || _a === void 0 ? void 0 : _a[0];
                                    return (challenge === null || challenge === void 0 ? void 0 : challenge.sentenceStartIndex) >= 0;
                                },
                                actions: send({
                                    type: "CHALLENGE_READY", // Notify UI
                                }),
                                target: "idleOnChallenge", // Transition to idle after notifying UI
                            },
                            {
                                cond: (context, event, { state }) => state.matches({ ChallengeCreator: "idle" }),
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
                                    cond: (context, event) => event.payload.buttonId === "back-button",
                                },
                                {
                                    target: "idleHome",
                                    cond: (context, event) => event.payload.buttonId === "skip-button",
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
                                    cond: (context, event) => event.payload.buttonId === "check-work-button",
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
                                        documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { textBeforeEdits: context.documentMetaData.currentText, currentText: event.data })),
                                    }),
                                ],
                            },
                        },
                    },
                    evaluateTextChanges: {
                        entry: [
                            assign({
                                documentMetaData: (context) => {
                                    const { challengeResponse, modifiedSentences, modifiedStartIndex, modifiedEndIndex, } = compareNewSentenceToOldSentence(context);
                                    console.log("modifiedSentences:", modifiedSentences);
                                    // Find the selected challenge
                                    const updatedChallengeArray = [
                                        ...context.documentMetaData.challengeArray,
                                    ];
                                    const selectedChallengeNumber = context.documentMetaData.selectedChallengeNumber;
                                    // Ensure the array and challenge exist before updating
                                    if (updatedChallengeArray[selectedChallengeNumber] &&
                                        updatedChallengeArray[selectedChallengeNumber][0]) {
                                        updatedChallengeArray[selectedChallengeNumber][0] = Object.assign(Object.assign({}, updatedChallengeArray[selectedChallengeNumber][0]), { challengeResponse,
                                            modifiedSentences, sentenceStartIndex: modifiedStartIndex, sentenceEndIndex: modifiedEndIndex });
                                    }
                                    else {
                                        console.warn("Selected challenge does not exist.");
                                    }
                                    // Return updated documentMetaData with the modified challengeArray
                                    return Object.assign(Object.assign({}, context.documentMetaData), { challengeArray: updatedChallengeArray });
                                },
                            }),
                        ],
                        always: [
                            {
                                cond: (context) => context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].challengeResponse === "valid",
                                target: "getAIJudgement",
                            },
                            {
                                cond: (context) => context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].challengeResponse === "noChanges",
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
                                cond: (context) => context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].challengeResponse === "tooFar",
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
                                        console.log(context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].challengeResponse);
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
                                            const { selectedChallengeNumber, pills, level } = context.documentMetaData;
                                            if (typeof selectedChallengeNumber === "number" &&
                                                pills[selectedChallengeNumber]) {
                                                // Create a new pills array with the updated pill
                                                const updatedPills = pills.map((pill, index) => index === selectedChallengeNumber
                                                    ? Object.assign(Object.assign({}, pill), { current: pill.current + 1 }) : pill);
                                                // Return the updated documentMetaData
                                                return Object.assign(Object.assign({}, context.documentMetaData), { pills: updatedPills, level: level + 1 });
                                            }
                                            else {
                                                throw new Error("Invalid selectedChallengeNumber or pill not found");
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
                                        uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { taskFeedbackMessage: event.data })),
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
                                        uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { taskFeedbackMessage: event.data })),
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
                    idleReflection: {
                        on: {
                            REFLECTION_SUBMITTED: {
                                target: ["idleHome", "#app.UI.celebrateScreen"],
                                actions: [
                                    // 1. Add reflection to documentMetaData.savedReflections
                                    assign({
                                        documentMetaData: (context) => (Object.assign(Object.assign({}, context.documentMetaData), { savedActivity: Object.assign(Object.assign({}, context.documentMetaData.savedActivity), { savedReflections: [
                                                    ...context.documentMetaData.savedActivity
                                                        .savedReflections,
                                                    Object.assign({}, context.uiState.reflection),
                                                ] }) })),
                                    }),
                                    // 2. Increase the level in the ReflectionTemplate
                                    assign({
                                        documentMetaData: (context) => (Object.assign(Object.assign({}, context.documentMetaData), { reflectionTemplate: Object.assign(Object.assign({}, context.documentMetaData.reflectionTemplate), { currentScore: context.documentMetaData.reflectionTemplate
                                                    .currentScore + 1 }) })),
                                    }),
                                    // 3. Turn reflectionTemplate into uiState.reflection
                                    assign({
                                        uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { reflection: context.documentMetaData.reflectionTemplate })),
                                    }),
                                    // 4. Increase the level in documentMetaData
                                    assign({
                                        documentMetaData: (context) => (Object.assign(Object.assign({}, context.documentMetaData), { level: context.documentMetaData.level + 1 })),
                                    }),
                                    //5. Set taskfeebackMessage.
                                    assign({
                                        uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { taskFeedbackMessage: "Thanks for reflecting on your work! Reflection saved." })),
                                    }),
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
                                        uiState: (context) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "home-page", waitingAnimationOn: false, visibleButtons: [] })),
                                    }),
                                    //Animate up to current level
                                    assign({
                                        uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { formerLevel: 1, animateLevelUp: true })),
                                    }),
                                    sendUIUpdate,
                                    //After animation set new default levels.
                                    assign({
                                        uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { formerLevel: context.uiState.level, animateLevelUp: false })),
                                    }),
                                ],
                            },
                            CUSTOMIZE_CLICKED: {
                                target: "customizeBase",
                            },
                            BUTTON_CLICKED: [
                                {
                                    target: "waitForChallenge", // Transition to a loading state
                                    cond: (context, event) => event.payload.buttonId === "pill-button" &&
                                        event.payload.buttonTitle !== -1, // -1 ==reflec t
                                    actions: [
                                        assign({
                                            documentMetaData: (context, event) => (Object.assign(Object.assign({}, context.documentMetaData), { selectedChallengeNumber: event.payload.buttonTitle })),
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
                                    cond: (context, event) => event.payload.buttonId === "pill-button" &&
                                        event.payload.buttonTitle == -1, // -1 ==reflec t
                                    actions: [
                                        assign({
                                            //We will load the uiState from defaultReflectio
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { selectedQuestion: 0 }) })),
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
                            CHALLENGE_READY: {
                                target: "aiFeel", // Go to the "ai-feel" state if the condition is met
                            },
                        },
                    },
                    aiFeel: {
                        entry: [
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "AI-Feeling", visibleButtons: ["back-button", "next-button"], cardMainText: context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].aiFeeling, waitingAnimationOn: false })),
                            }),
                            sendUIUpdate,
                            highlightChallengeSentence,
                        ],
                        on: {
                            BUTTON_CLICKED: [
                                {
                                    target: "home",
                                    cond: (context, event) => event.payload.buttonId === "back-button",
                                },
                                {
                                    target: "challengeTaskDisplay",
                                    cond: (context, event) => event.payload.buttonId === "next-button",
                                },
                            ],
                        },
                    },
                    challengeTaskDisplay: {
                        entry: [
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "challenge-card", visibleButtons: ["skip-button", "check-work-button"], waitingAnimationOn: false, tasks: context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].taskArray, cardSubtitle: context.documentMetaData.challengeArray[context.documentMetaData.selectedChallengeNumber][0].challengeTitle, taskFeedback: undefined })),
                            }),
                            sendUIUpdate,
                        ],
                        on: {
                            BUTTON_CLICKED: [
                                {
                                    target: "home",
                                    cond: (context, event) => event.payload.buttonId === "skip-button",
                                },
                                {
                                    cond: (context, event) => event.payload.buttonId === "check-work-button",
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: true })),
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                            ],
                            REVIEWED: [
                                {
                                    cond: (context, event) => event.payload.challengeResponse === "noChanges",
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: false, taskFeedback: "no-changes" })),
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                                {
                                    cond: (context, event) => event.payload.challengeResponse === "tooFar",
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: false, taskFeedback: "wrong-location", disabledButtons: ["check-work-button"] })),
                                        }),
                                        sendUIUpdate,
                                        (context, event) => {
                                            console.log("REVIEWED_TOO_FAR");
                                        },
                                    ],
                                },
                                {
                                    cond: (context, event) => event.payload.challengeResponse === "incorrect",
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { waitingAnimationOn: false, taskFeedback: "incorrect" })),
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                                {
                                    target: "celebrateScreen",
                                    cond: (context, event) => event.payload.challengeResponse === "correct",
                                },
                            ],
                        },
                    },
                    celebrateScreen: {
                        entry: [
                            "assignDocMetaDataToUIState",
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "celebrateScreen", visibleButtons: ["next-button"], cardMainText: context.uiState.taskFeedbackMessage, waitingAnimationOn: false, animateLevelUp: true, formerLevel: context.uiState.level - 1 })),
                            }),
                            sendUIUpdate,
                            //After animation set new default levels.
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { formerLevel: context.uiState.level, animateLevelUp: false })),
                            }),
                        ],
                        on: {
                            BUTTON_CLICKED: {
                                target: "home",
                                cond: (context, event) => event.payload.buttonId === "next-button",
                            },
                        },
                    },
                    reflectionQuestions: {
                        entry: [
                            assign({
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "reflection-card", visibleButtons: context.uiState.reflection.selectedQuestion ===
                                        context.uiState.reflection.question.length - 1
                                        ? ["back-button", "submit-button"]
                                        : ["back-button", "next-button"] })),
                            }),
                            sendUIUpdate,
                        ],
                        on: {
                            BUTTON_CLICKED: [
                                {
                                    target: "home",
                                    cond: (context, event) => event.payload.buttonId === "back-button" &&
                                        context.uiState.reflection.selectedQuestion === 0,
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { noInputOnSubmit: false }) })),
                                        }),
                                        send((context, event) => ({
                                            type: "BACK_TO_HOME",
                                        })), // Ensure the action is returned properly
                                    ],
                                },
                                {
                                    target: "reflectionQuestions",
                                    cond: (context, event) => event.payload.buttonId === "back-button" &&
                                        context.uiState.reflection.selectedQuestion != 0,
                                    actions: [
                                        assign({
                                            uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { noInputOnSubmit: false, selectedQuestion: context.uiState.reflection.selectedQuestion - 1, visibleButtons: ["back-button", "next-button"] }) })),
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                                {
                                    target: "reflectionQuestions",
                                    cond: (context, event) => (event.payload.buttonId === "next-button" ||
                                        event.payload.buttonId === "submit-button") &&
                                        event.payload.textResponse.length === 0,
                                    actions: [
                                        assign({
                                            uiState: (context, event) => {
                                                return Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { noInputOnSubmit: true }) });
                                            },
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                                {
                                    target: "reflectionQuestions",
                                    cond: (context, event) => event.payload.buttonId === "next-button" &&
                                        event.payload.textResponse.length > 0,
                                    actions: [
                                        assign({
                                            uiState: (context, event) => {
                                                const selectedQuestionIndex = context.uiState.reflection.selectedQuestion;
                                                // Copy existing submittedAnswers array
                                                const updatedAnswers = [
                                                    ...context.uiState.reflection.submittedAnswers,
                                                ];
                                                // Add or update the response at the selected index
                                                updatedAnswers[selectedQuestionIndex] =
                                                    event.payload.textResponse;
                                                return Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { noInputOnSubmit: false, submittedAnswers: updatedAnswers, selectedQuestion: selectedQuestionIndex + 1 }) });
                                            },
                                        }),
                                        sendUIUpdate,
                                    ],
                                },
                                {
                                    //target will be sent via MainFlow
                                    cond: (context, event) => event.payload.buttonId === "submit-button" &&
                                        event.payload.textResponse.length > 0,
                                    actions: [
                                        assign({
                                            uiState: (context, event) => {
                                                const selectedQuestionIndex = context.uiState.reflection.selectedQuestion;
                                                // Copy existing submittedAnswers array
                                                const updatedAnswers = [
                                                    ...context.uiState.reflection.submittedAnswers,
                                                ];
                                                // Add or update the response at the selected index
                                                updatedAnswers[selectedQuestionIndex] =
                                                    event.payload.textResponse;
                                                return Object.assign(Object.assign({}, context.uiState), { reflection: Object.assign(Object.assign({}, context.uiState.reflection), { noInputOnSubmit: false, submittedAnswers: updatedAnswers }) });
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
                                uiState: (context, event) => (Object.assign(Object.assign({}, context.uiState), { currentPage: "customize-card", visibleButtons: ["back-button"] })),
                            }),
                            sendUIUpdate,
                        ],
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
                uiState: (context, event) => {
                    // 🔹 Debugging: Log before and after assignment
                    const updatedUIState = Object.assign(Object.assign({}, context.uiState), { lastUpdated: new Date().toISOString(), level: context.documentMetaData.level, pills: context.documentMetaData.pills });
                    return updatedUIState;
                },
            }),
            shiftTopicChallenge: assign({
                documentMetaData: (context) => {
                    const { challengeArray, selectedChallengeNumber } = context.documentMetaData || {};
                    if (challengeArray && challengeArray[selectedChallengeNumber]) {
                        challengeArray[selectedChallengeNumber].shift();
                    }
                    return Object.assign(Object.assign({}, context.documentMetaData), { challengeArray, selectedChallengeNumber: -1 });
                },
            }),
            addNewChallengesToChallengeArray: assign({
                documentMetaData: (context) => {
                    if (context.documentMetaData.newChallengesReady) {
                        const { challengeArray, newChallengesArray } = context.documentMetaData;
                        // Debugging: Log the initial state
                        // Merge corresponding arrays at each index
                        const updatedChallengeArray = challengeArray.map((arr, index) => {
                            const newArrayAtIndex = newChallengesArray[index] || []; // Handle missing indices // Debugging: Log merging process
                            return arr.concat(newArrayAtIndex); // Append the arrays
                        });
                        return Object.assign(Object.assign({}, context.documentMetaData), { challengeArray: updatedChallengeArray, newChallengesArray: [], newChallengesReady: false });
                    }
                    else {
                        return context.documentMetaData;
                    }
                },
            }),
        },
        guards: {
            isChallengeReady: (context) => {
                var _a, _b;
                const documentMetaData = context.documentMetaData || {
                    challengeArray: [],
                    selectedChallengeNumber: 0,
                }; // Ensure it's not null
                const { challengeArray, selectedChallengeNumber } = documentMetaData;
                // Check if challengeArray is an array and the selected challenge is ready
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