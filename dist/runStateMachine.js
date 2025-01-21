"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const xstate_1 = require("xstate");
const stateMachine_1 = require("./stateMachine"); // Adjust the path as necessary
// Interpret the machine
const service = (0, xstate_1.interpret)(stateMachine_1.appMachine)
    .onTransition((state) => {
    console.log("Current state:", state.value);
    console.log("Current context:", state.context);
})
    .start();
// Simulate sending events
service.send({ type: "RECEIVE_TOKEN", token: "invalid-token" });
setTimeout(() => {
    service.send({ type: "RECEIVE_TOKEN", token: "valid-token" });
}, 1000);
