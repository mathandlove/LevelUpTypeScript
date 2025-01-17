import {
  UIState,
  ButtonId,
  ButtonClickedPayload,
  defaultUIState,
} from "./common/types";

// Application states (different from UI pages)
type AppStateType =
  | "INIT"
  | "LOADING_TOPICS"
  | "LOADING_CHALLENGE"
  | "IN_CHALLENGE"
  | "CHECKING_WORK"
  | "SUBMITTING_REFLECTION"
  | "ERROR";

interface AppState {
  currentState: AppStateType;
  clientId?: string;
  documentId?: string;
  token?: string;
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
};

export function transitionFromInit(currentState: State): State {
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
      cardMainText: "Loading your topics...",
    },
    app: {
      ...currentState.app,
      currentState: "LOADING_TOPICS",
    },
  };
}

export { stateMachine, State, AppState, AppStateType, StateTransitionFunction };
