"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const xstate_1 = require("xstate");
const stateMachine_1 = require("./stateMachine");
const dataServices = __importStar(require("./services/dataService"));
jest.mock("./services/dataService");
describe("appMachine", () => {
    /* it("should transition to 'authenticated' with a valid token", async () => {
      // Mock getClientId to resolve
      (dataServices.getClientId as jest.Mock).mockResolvedValue(
        "valid-client-id"
      );
  
      const service = interpret(appMachine).start();
  
      // Send RECEIVE_TOKEN event
      service.send({ type: "RECEIVE_TOKEN", token: "valid-token" });
  
      // Wait for the state to transition
      await new Promise((resolve) => setTimeout(resolve, 0));
  
      expect(service.state.matches("authenticated")).toBe(true);
      expect(service.state.context.clientId).toBe("valid-client-id");
    });
  */
    it("should transition to 'authenticationError' with an invalid token", async () => {
        // Mock getClientId to reject with an AuthError
        dataServices.getClientId.mockRejectedValue(new dataServices.AuthError("Invalid token"));
        const service = (0, xstate_1.interpret)(stateMachine_1.appMachine).start();
        // Send RECEIVE_TOKEN event
        service.send({ type: "RECEIVE_TOKEN", token: "invalid-token" });
        // Wait for the state to transition
        await new Promise((resolve) => setTimeout(resolve, 0));
        console.log("Current state:", service.state.value);
        console.log("Current context:", service.state.context);
        expect(service.state.matches("authenticationError")).toBe(true);
        expect(service.state.context.errorMessage).toBe("Invalid token");
    });
    it("should transition to 'networkError' when a network error occurs", async () => {
        // Mock getClientId to reject with a NetworkError
        dataServices.getClientId.mockRejectedValue(new dataServices.NetworkError("Cannot connect with Google"));
        const service = (0, xstate_1.interpret)(stateMachine_1.appMachine).start();
        // Send RECEIVE_TOKEN event
        service.send({ type: "RECEIVE_TOKEN", token: "network-fail" });
        // Wait for the state to transition
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(service.state.matches("networkError")).toBe(true);
        expect(service.state.context.errorMessage).toBe("Cannot connect with Google");
    });
});
