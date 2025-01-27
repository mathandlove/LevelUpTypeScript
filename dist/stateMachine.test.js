/*
import { interpret } from "xstate";
import { appMachine } from "./stateMachine";
import * as dataServices from "./services/dataService";

// Manually mock only the getClientId function
jest.mock("./services/dataService", () => {
  const originalModule = jest.requireActual("./services/dataService");
  return {
    ...originalModule,
    getClientId: jest.fn(),
  };
});

describe("appMachine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should transition to 'authenticated' with a valid token", async () => {
    (dataServices.getClientId as jest.Mock).mockResolvedValue(
      "valid-client-id"
    );

    const service = interpret(appMachine)
      .onTransition((state) => {
        console.log("Current state:", state.value);
      })
      .start();
    service.send({ type: "RECEIVE_TOKEN", token: "valid-token" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(service.state.matches("authenticated")).toBe(true);
    expect(service.state.context.clientId).toBe("valid-client-id");
  });

  test("should transition to 'authenticationError' with an invalid token", async () => {
    (dataServices.getClientId as jest.Mock).mockRejectedValue(
      new dataServices.AuthError("Invalid token")
    );

    const service = interpret(appMachine)
      .onTransition((state) => {
        console.log("Current state:", state.value);
      })
      .start();
    service.send({ type: "RECEIVE_TOKEN", token: "invalid-token" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(service.state.matches("authenticationError")).toBe(true);
  });

  test("should transition to 'networkError' when a network error occurs", async () => {
    (dataServices.getClientId as jest.Mock).mockRejectedValue(
      new dataServices.NetworkError("Cannot connect with Google")
    );

    const service = interpret(appMachine)
      .onTransition((state) => {
        console.log("Current state:", state.value);
      })
      .start();
    service.send({ type: "RECEIVE_TOKEN", token: "network-fail" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(service.state.matches("networkError")).toBe(true);
    expect(service.state.context.errorMessage).toBe(
      "Could not connect with Google. Please try again later."
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });
});
*/
//# sourceMappingURL=stateMachine.test.js.map