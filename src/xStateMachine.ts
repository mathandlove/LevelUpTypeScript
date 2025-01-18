import {
  createMachine,
  assign,
  BaseActionObject,
  ServiceMap,
  TypegenDisabled,
  ResolveTypegenMeta,
  Typestate,
  MachineOptions,
  MachineConfig,
} from "xstate";
import { getClientId, AuthError } from "./services/dataService";
import { UIState, defaultUIState } from "./common/types";

interface AppContext {
  token?: string;
  clientId?: string;
  uiState: UIState;
}

type AppEvent =
  | { type: "RECEIVE_TOKEN"; token: string }
  | { type: "ERROR_OCCURRED"; message: string };

const machineConfig: MachineConfig<AppContext, any, AppEvent> = {
  predictableActionArguments: true,
  id: "app",
  initial: "initial",
  context: {
    token: undefined,
    clientId: undefined,
    uiState: { ...defaultUIState },
  },
  states: {
    initial: {
      on: {
        RECEIVE_TOKEN: {
          target: "loadingClientId",
          actions: assign({
            token: (_, event) => event.token,
          }),
        },
      },
    },
    loadingClientId: {
      invoke: {
        src: (context) => getClientId(context.token!),
        onDone: {
          target: "authenticated",
          actions: assign({
            clientId: (_, event) => event.data,
          }),
        },
        onError: [
          {
            cond: "isAuthError",
            target: "serverErrorAuth",
          },
          {
            cond: "isNetworkError",
            target: "serverErrorNetwork",
          },
          {
            target: "serverErrorGeneral",
          },
        ],
      },
    },
    authenticated: {
      // Good token & clientId
    },
    serverErrorAuth: {
      entry: assign((context, event) => ({
        ...context,
        uiState: {
          ...context.uiState,
          currentPage: "server-error",
          waitingAnimationOn: false,
          visibleButtons: [],
          buttonsDisabled: [],
          cardMainText: "Error: Invalid or expired token. Please try again.",
        },
      })),
    },
    serverErrorNetwork: {
      entry: assign((context, event) => ({
        ...context,
        uiState: {
          ...context.uiState,
          currentPage: "server-error",
          waitingAnimationOn: false,
          visibleButtons: [],
          buttonsDisabled: [],
          cardMainText:
            "Error: Unable to reach Google servers. Please wait or retry later.",
        },
      })),
    },
    serverErrorGeneral: {
      entry: assign((context, event) => ({
        ...context,
        uiState: {
          ...context.uiState,
          currentPage: "server-error",
          waitingAnimationOn: false,
          visibleButtons: [],
          buttonsDisabled: [],
          cardMainText: "An unexpected error occurred. Please contact support.",
        },
      })),
    },
  },
};

const machineOptions: MachineOptions<AppContext, AppEvent> = {
  guards: {
    isAuthError: (_, event) => {
      const e = event as any;
      return e?.data instanceof AuthError;
    },
    isNetworkError: (_, event) => {
      const e = event as any;
      const err = e?.data as Error;
      return err.message?.toLowerCase().includes("fetch");
    },
  },
};

export const appMachine = createMachine<
  AppContext,
  AppEvent,
  Typestate<AppContext>
>(machineConfig, machineOptions);
