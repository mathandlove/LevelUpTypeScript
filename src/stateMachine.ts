import {
  UIState,
  ButtonId,
  ButtonClickedPayload,
  defaultUIState,
} from "./common/types";
import { LevelUpWebSocket } from "./common/types";
import { sendMessage } from "./websocket";
// Application states (different from UI pages)
type AppStateType =
  | "INIT"
  | "LOADING_TOPICS"
  | "HOME_WAITING"
  | "LOADING_CHALLENGE"
  | "IN_CHALLENGE"
  | "CHECKING_WORK"
  | "SUBMITTING_REFLECTION"
  | "ERROR";

interface AppState {
  currentState: AppStateType;
  clientId?: string;
  documentId?: string;
  token: string;
  focusObject: {
    challenges: Array<{
      id: string;
      completed: boolean;
      attempts: number;
    }>;
    currentChallenge?: string;
  };
  documentData?: {
    content?: string;
    selection?: string;
  };
}

// Create default app state
const defaultAppState: AppState = {
  currentState: "INIT",
  focusObject: {
    challenges: [],
    currentChallenge: undefined,
  },
  documentData: {
    content: undefined,
    selection: undefined,
  },
  documentId: undefined,
  token: "WAITING_FOR_TOKEN",
};

interface State {
  ui: UIState;
  app: AppState;
}

export function createNewState(): State {
  return {
    ui: { ...defaultUIState },
    app: { ...defaultAppState },
  };
}

type StateTransitionFunction = (
  currentState: State,
  data: ButtonClickedPayload
) => State | Promise<State>;

interface StateMachine {
  [key: string]: {
    [key in ButtonId]?: StateTransitionFunction;
  };
}

const stateMachine: StateMachine = {
  INIT: {
    // No button handlers needed - this state transitions automatically
  },
  LOADING_TOPICS: {
    // No button handlers needed - this state transitions automatically
    // after Google Docs data is loaded
  },
};

export async function orchestrate(
  ws: LevelUpWebSocket,
  state: State
): Promise<State> {
  let currentState = state;
  let nextState: State;

  do {
    nextState = await transition(currentState);

    // Check if UI state has changed
    if (JSON.stringify(nextState.ui) !== JSON.stringify(currentState.ui)) {
      sendMessage(ws, "state", undefined, nextState.ui);
    }

    if (nextState.app.currentState !== currentState.app.currentState) {
      currentState = nextState;
    } else {
      break; // Exit loop if no state change
    }
  } while (true);

  return currentState;
}

export async function transition(state: State): Promise<State> {
  // Handle transitions based on current state
  switch (state.app.currentState) {
    case "INIT":
      return transitionFromInit(state);

    case "LOADING_TOPICS":
      try {
        const topics = await loadTopicsFromGoogleDocs(state.app.token);
        return handleTopicsLoaded(state, topics);
      } catch (error) {
        throw error;
      }

    // Add other state transitions
    default:
      return state; // No transition needed
  }

  function transitionFromInit(currentState: State): State {
    if (currentState.app.currentState !== "INIT") {
      throw new Error(
        `Cannot transition from INIT: current state is ${currentState.app.currentState}`
      );
    }
    return {
      ...currentState,
      ui: {
        ...currentState.ui,
        currentPage: "home-page",
        waitingAnimationOn: true,
        visibleButtons: [],
        buttonsDisabled: [],
      },
      app: {
        ...currentState.app,
        currentState: "LOADING_TOPICS",
      },
    };
  }

  function loadTopicsFromGoogleDocs(token: string): Promise<
    Array<{
      title: string;
      outOf: number;
      current: number;
    }>
  > {
    return Promise.resolve([]);
  }

  async function handleTopicsLoaded(
    currentState: State,
    topics: Array<{
      title: string;
      outOf: number;
      current: number;
    }>
  ): Promise<State> {
    if (currentState.app.currentState !== "LOADING_TOPICS") {
      throw new Error(
        `Cannot load topics: current state is ${currentState.app.currentState}`
      );
    }

    return {
      ...currentState,
      ui: {
        ...currentState.ui,
        currentPage: "home-page",
        waitingAnimationOn: false,
        visibleButtons: ["pill-button"],
        pills: topics,
      },
      app: {
        ...currentState.app,
        currentState: "HOME_WAITING",
      },
    };
  }
}

// Function to handle the topic loading transition

export { stateMachine, State, AppState, AppStateType, StateTransitionFunction };
