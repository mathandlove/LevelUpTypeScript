import { createMachine, assign, interpret } from "xstate";
import {
  getClientId,
  AuthError,
  NetworkError,
} from "./services/dataService.js";
import { UIState, defaultUIState } from "./common/types.js";
import { IncomingWebSocketMessage } from "./common/wsTypes.js";

interface AppState {
  token: string;
  clientId: string;
  documentId: string;
}

// Define the DocState type
type DocState = string;

const defaultDocState: DocState = "waiting for documentID";

type AppEvent = IncomingWebSocketMessage;

const defaultAppState: AppState = {
  token: "Waiting for token...",
  clientId: "Waiting for clientID",
  documentId: "waiting for documentID",
};

interface AppContext {
  appState: AppState;
  uiState: UIState;
  docState: DocState;
}

const defaultAppContext: AppContext = {
  appState: defaultAppState,
  uiState: defaultUIState,
  docState: defaultDocState,
};

export const appMachine = createMachine<AppContext, AppEvent>(
  {
    id: "app",
    initial: "initial",
    predictableActionArguments: true,
    context: defaultAppContext,
    states: {
      initial: {
        on: {
          RECEIVE_TOKEN: {
            target: "tokenReceived",
            actions: assign({
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
                console.log(
                  "Received valid token. Transitioning to authenticate"
                );
              },
            ],
          },
          onError: [
            {
              target: "authenticationError",
              cond: "isAuthError",
              actions: assign({
                uiState: (context, event) => ({
                  ...context.uiState, // Spread the current appState
                  errorMessage:
                    "We cannot connect to Google Servers at this time. Please try again later.",
                }),
              }),
            },
            {
              target: "networkError",
              cond: "isNetworkError",
              actions: assign({
                uiState: (context, event) => ({
                  ...context.uiState, // Spread the current uiState
                  errorMessage:
                    "We cannot connect to Google Servers at this time. Please try again later.",
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
            actions: assign({
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
  },
  {
    actions: {
      requestNewTokenAction: () => {
        console.log("Requesting new token from server...");
      },
    },
    services: {
      validateTokenService: (context: AppContext) => {
        return getClientId(context.appState.token);
      },
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

// Store to track actors
const actorStore = new Map<string, ReturnType<typeof interpret>>();

// Utility function
export function getOrCreateActor(clientId: string, documentId: string) {
  const key = `${clientId}:${documentId}`; // Unique key for each client-document combination

  if (actorStore.has(key)) {
    // Return existing actor if it exists
    return actorStore.get(key)!;
  }

  // Create a new interpreted actor
  const actor = interpret(appMachine).start();

  // Save the actor in the store
  actorStore.set(key, actor as any);

  // Handle actor cleanup
  actor.onStop(() => {
    actorStore.delete(key); // Remove from store when stopped
  });

  return actor;
}
