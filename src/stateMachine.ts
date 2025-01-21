import { createMachine, assign, interpret } from "xstate";
import { getClientId, AuthError, NetworkError } from "./services/dataService";
interface AppContext {
  token?: string;
  clientId?: string;
  errorMessage?: string;
}

type AppEvent = { type: "RECEIVE_TOKEN"; token: string };

export const appMachine = createMachine<AppContext, AppEvent>(
  {
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
            actions: assign({ token: (_, event) => event.token }),
          },
        },
      },
      tokenReceived: {
        invoke: {
          src: "validateTokenService",
          onDone: {
            target: "authenticated",
            actions: [
              assign({ clientId: (_, event) => event.data }),
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
              actions: [
                assign({
                  errorMessage:
                    "Authentication error. You don't have permission to edit this document.",
                }),
                (context, event) => {
                  console.log(
                    "Received valid token. Transitioning to authenticate"
                  );
                },
              ],
            },
            {
              target: "networkError",
              cond: "isNetworkError",
              actions: assign({
                errorMessage:
                  "Could not connect with Google. Please try again later.",
              }),
            },
            {
              target: "initial",
              actions: (context, event) => {
                console.log("This Error aint big enough for the both of us.");
                console.log(event);
              },
            },
          ],
        },
      },
      authenticationError: {
        on: {
          RECEIVE_TOKEN: {
            //target: "tokenReceived",
            actions: assign({ token: (_, event) => event.token }),
          },
        },
      },
      networkError: {
        on: {
          RECEIVE_TOKEN: {
            target: "tokenReceived",
            actions: assign({ token: (_, event) => event.token }),
          },
        },
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
        return getClientId(context.token!);
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
