import {
  interpret,
  Interpreter,
  createMachine,
  assign,
  spawn,
  sendParent,
} from "xstate";

import { LevelUpWebSocket } from "./websocket.js";
import { AppEvent, AppContext, defaultAppContext } from "./common/appTypes.js";

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

// 🔹 Create Challenge Machine
const createChallengeMachine = createMachine({
  id: "createChallenge",
  initial: "idle",
  states: {
    idle: {
      on: { START: "loadingChallenge" },
    },
    loadingChallenge: {
      invoke: {
        src: "fetchChallenge", // Placeholder function
        onDone: {
          target: "success",
          actions: sendParent((context, event) => ({
            type: "CHALLENGE_COMPLETE",
            data: event.data,
          })),
        },
        onError: "error",
      },
    },
    success: { type: "final" },
    error: { type: "final" },
  },
});

// 🔹 Create Rubric Machine
const createRubricMachine = createMachine({
  id: "createRubric",
  initial: "idle",
  states: {
    idle: {
      on: { START: "loadingRubric" },
    },
    loadingRubric: {
      invoke: {
        src: "fetchRubric", // Placeholder function
        onDone: {
          target: "success",
          actions: sendParent((context, event) => ({
            type: "RUBRIC_COMPLETE",
            data: event.data,
          })),
        },
        onError: "error",
      },
    },
    success: { type: "final" },
    error: { type: "final" },
  },
});

// 🔹 MainFlow Machine (Parent)
export function createAppMachine(ws: LevelUpWebSocket) {
  return createMachine<AppContext, AppEvent>({
    id: "mainFlow",
    initial: "idle",
    context: defaultAppContext,
    states: {},
  });
}
/*idle: {
      on: {
        START_CHALLENGE: {
          actions: assign({
            challengeActor: (context, event) =>
              spawn(createChallengeMachine, { name: "createChallenge" })
          })
        },
        START_RUBRIC: {
          actions: assign({
            rubricActor: (context, event) =>
              spawn(createRubricMachine, { name: "createRubric" })
          })
        }
      }
    },
    waitingForChallenge: {
      on: {
        CHALLENGE_COMPLETE: {
          actions: [
            (context, event) => {
              console.log("✅ Challenge Done:", event.data);
            }
          ]
        }
      }
    },
    waitingForRubric: {
      on: {
        RUBRIC_COMPLETE: {
          actions: [
            (context, event) => {
              console.log("✅ Rubric Done:", event.data);
            }
          ]
        }
      }
    }
  }
});
}
*/
