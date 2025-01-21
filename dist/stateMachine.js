"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appMachine = void 0;
const xstate_1 = require("xstate");
const dataService_1 = require("./services/dataService");
exports.appMachine = (0, xstate_1.createMachine)({
    id: "app",
    initial: "initial",
    predictableActionArguments: true,
    context: {
        token: undefined,
        clientId: undefined,
        errorMessage: undefined,
    },
    states: {
        initial: {
            on: {
                RECEIVE_TOKEN: {
                    target: "tokenReceived",
                    actions: (0, xstate_1.assign)({ token: (_, event) => event.token }),
                },
            },
        },
        tokenReceived: {
            invoke: {
                src: "validateTokenService",
                onDone: {
                    target: "authenticated",
                    actions: [
                        (0, xstate_1.assign)({ clientId: (_, event) => event.data }),
                        () => console.log("Received valid token. Transitioning to authenticated state."),
                    ],
                },
                onError: [
                    {
                        target: "authenticationError",
                        cond: "isAuthError",
                        actions: [
                            (0, xstate_1.assign)({
                                errorMessage: "Authentication error. You don't have permission to edit this document.",
                            }),
                            () => console.log("Transitioning to authenticationError"),
                        ],
                    },
                    {
                        target: "networkError",
                        cond: "isNetworkError",
                        actions: (0, xstate_1.assign)({
                            errorMessage: "Could not connect with Google. Please try again later.",
                        }),
                    },
                ],
            },
        },
        authenticationError: {
            on: {
                RECEIVE_TOKEN: {
                    //target: "tokenReceived",
                    actions: (0, xstate_1.assign)({ token: (_, event) => event.token }),
                },
            },
        },
        networkError: {
            on: {
                RECEIVE_TOKEN: {
                    target: "tokenReceived",
                    actions: (0, xstate_1.assign)({ token: (_, event) => event.token }),
                },
            },
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
            return (0, dataService_1.getClientId)(context.token);
        },
    },
    guards: {
        isAuthError: (_, event) => event instanceof dataService_1.AuthError,
        isNetworkError: (_, event) => event instanceof dataService_1.NetworkError,
    },
});
