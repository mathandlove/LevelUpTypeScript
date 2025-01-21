"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const xstate_1 = require("xstate");
const inspect_1 = require("@xstate/inspect");
const stateMachine_1 = require("./stateMachine"); // Import the appMachine
// Initialize the inspector
(0, inspect_1.inspect)({
    iframe: false,
    url: "https://statecharts.io/inspect",
});
// Interpret the machine
const service = (0, xstate_1.interpret)(stateMachine_1.appMachine, { devTools: true })
    .onTransition((state) => {
    console.log("Current state:", state.value);
})
    .start();
// Expose the service to the global scope
window.appService = service;
