import { createMachine, interpret } from "xstate";
import { inspect } from "@xstate/inspect";
import { appMachine } from "./stateMachine"; // Import the appMachine

declare global {
  interface Window {
    appService: any; // Use the correct type if you know it
  }
}
// Initialize the inspector
inspect({
  iframe: false,
  url: "https://statecharts.io/inspect",
});

// Interpret the machine
const service = interpret(appMachine, { devTools: true })
  .onTransition((state) => {
    console.log("Current state:", state.value);
  })
  .start();

// Expose the service to the global scope
window.appService = service;
