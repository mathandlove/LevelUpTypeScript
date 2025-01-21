"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appMachine = void 0;
exports.getOrCreateActor = getOrCreateActor;
const xstate_1 = require("xstate");
const dataService_1 = require("./services/dataService");
const types_1 = require("./common/types");
const defaultDocState = "waiting for documentID";
const defaultAppState = {
    token: "Waiting for token...",
    clientId: "Waiting for clientID",
    documentId: "waiting for documentID",
};
const defaultAppContext = {
    appState: defaultAppState,
    uiState: types_1.defaultUIState,
    docState: defaultDocState,
};
exports.appMachine = (0, xstate_1.createMachine)({
    id: "app",
    initial: "initial",
    predictableActionArguments: true,
    context: defaultAppContext,
    states: {
        initial: {
            on: {
                RECEIVE_TOKEN: {
                    target: "tokenReceived",
                    actions: (0, xstate_1.assign)({
                        appState: (context, event) => ({
                            ...context.appState, // Spread the current appState
                            token: event.payload.token, // Update the token property
                            clientId: event.payload.clientId, // Optionally update clientId
                            documentId: event.payload.documentId, // Optionally update documentId
                        }),
                    }),
                },
            },
        },
        tokenReceived: {
            invoke: {
                src: "validateTokenService",
                onDone: {
                    target: "authenticated",
                    actions: [
                        (context, event) => {
                            console.log("Received valid token. Transitioning to authenticate");
                        },
                    ],
                },
                onError: [
                    {
                        target: "authenticationError",
                        cond: "isAuthError",
                        actions: (0, xstate_1.assign)({
                            uiState: (context, event) => ({
                                ...context.uiState, // Spread the current appState
                                errorMessage: "We cannot connect to Google Servers at this time. Please try again later.",
                            }),
                        }),
                    },
                    {
                        target: "networkError",
                        cond: "isNetworkError",
                        actions: (0, xstate_1.assign)({
                            uiState: (context, event) => ({
                                ...context.uiState, // Spread the current uiState
                                errorMessage: "We cannot connect to Google Servers at this time. Please try again later.",
                            }),
                        }),
                    },
                    {
                        target: "initial",
                        actions: (context, event) => {
                            console.log("Found Error that was not accounted for.");
                            console.log(event);
                        },
                    },
                ],
            },
        },
        authenticationError: {
            on: {
                RECEIVE_TOKEN: {
                    target: "tokenReceived",
                    actions: (0, xstate_1.assign)({
                        appState: (context, event) => ({
                            ...context.appState, // Spread the current appState
                            token: event.payload.token, // Update the token property
                            clientId: event.payload.clientId, // Optionally update clientId
                            documentId: event.payload.documentId, // Optionally update documentId
                        }),
                    }),
                },
            },
        },
        networkError: {
            type: "final",
        },
        authenticated: {
            type: "final",
        },
    },
}, {
    actions: {
        requestNewTokenAction: () => {
            console.log("Requesting new token from server...");
        },
    },
    services: {
        validateTokenService: (context) => {
            return (0, dataService_1.getClientId)(context.appState.token);
        },
    },
    guards: {
        isAuthError: (_, event) => {
            const error = event.data;
            return error?.name === "AuthError";
        },
        isNetworkError: (_, event) => {
            const error = event.data;
            return error?.name === "NetworkError";
        },
    },
});
// Store to track actors
const actorStore = new Map();
// Utility function
function getOrCreateActor(clientId, documentId) {
    const key = `${clientId}:${documentId}`; // Unique key for each client-document combination
    if (actorStore.has(key)) {
        // Return existing actor if it exists
        return actorStore.get(key);
    }
    // Create a new interpreted actor
    const actor = (0, xstate_1.interpret)(exports.appMachine).start();
    // Save the actor in the store
    actorStore.set(key, actor);
    // Handle actor cleanup
    actor.onStop(() => {
        actorStore.delete(key); // Remove from store when stopped
    });
    return actor;
}
