import { Machine, interpret, assign, DoneInvokeEvent } from "xstate";
import logger from "./utils/logger";
import { getClientId, AuthError } from "./services/dataService";

interface AppContext {
  token?: string;
  clientId?: string;
  ws?: WebSocket;
}

type AppEvent =
  | { type: "RECEIVE_TOKEN"; token: string; ws: WebSocket }
  | { type: "SEND_ERROR"; message: string };

const sendAuthError = (context: AppContext, event: any) => {
  if (context.ws) {
    const errorMessage = JSON.stringify({
      type: "ERROR",
      payload: {
        code: "AUTH_ERROR",
        message: "Authentication failed",
      },
    });
    context.ws.send(errorMessage);
  }
  resetContext;
};

const resetContext = assign<AppContext>({
  token: () => {
    console.log("Resetting token,Websocket,andclientID");
    return undefined;
  },
  ws: () => {
    return undefined;
  },
  clientId: () => {
    return undefined;
  },
});

const appMachine = Machine<AppContext, any, AppEvent>({
  id: "app",
  initial: "initial",
  context: {
    token: undefined,
    clientId: undefined,
    ws: undefined,
  },
  states: {
    initial: {
      on: {
        RECEIVE_TOKEN: {
          target: "loadingClientId",
          actions: [
            assign<AppContext, AppEvent & { type: "RECEIVE_TOKEN" }>({
              token: (context, event) => {
                console.log("Setting token:", event.token);
                return event.token;
              },
              ws: (context, event) => {
                console.log("Setting WebSocket:", event.ws);
                return event.ws;
              },
            }),
            (context) =>
              console.log("WebSocket set in initial state:", context.ws),
          ],
        },
      },
    },
    loadingClientId: {
      onEntry: (context) => {
        console.log("Entering loadingClientId state with context:", context);
      },
      invoke: {
        id: "getClientId",
        src: (context) => getClientId(context.token!),
        onDone: {
          target: "authenticated",
          actions: assign<AppContext, DoneInvokeEvent<string>>({
            clientId: (context, event) => event.data,
          }),
        },
        onError: {
          target: "initial",
          actions: [
            // 1) This uses context.ws to send the error
            (context, event) => {
              sendAuthError(context, event);
            },
            // 2) Now that the error is sent, clear token, clientId, and ws
          ],
        },
      },
    },
    authenticated: {
      // This state represents that we have a valid token and clientId
    },
  },
});

// Rest of the file remains the same...

export { appMachine, AppContext, AppEvent };
