import { interpret } from "xstate";
import { appMachine } from "../xStateMachine";
import { getClientId, AuthError } from "../services/dataService";

// Mock the getClientId function
jest.mock("../services/dataService", () => ({
  getClientId: jest.fn(),
  AuthError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

describe("App Machine - Authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should transition to authenticated state with valid token", (done) => {
    (getClientId as jest.Mock).mockResolvedValueOnce("valid-client-id");

    const service = interpret(appMachine)
      .onTransition((state) => {
        if (state.matches("authenticated")) {
          try {
            expect(state.context.clientId).toBe("valid-client-id");
            service.stop();
            done();
          } catch (error) {
            service.stop();
            done(error);
          }
        }
      })
      .start();

    service.send({ type: "RECEIVE_TOKEN", token: "valid-token" });
  });

  it("should transition to serverErrorAuth state with invalid token", (done) => {
    (getClientId as jest.Mock).mockRejectedValueOnce(
      new AuthError("Invalid token")
    );

    const service = interpret(appMachine)
      .onTransition((state) => {
        if (state.matches("serverErrorAuth")) {
          try {
            const { uiState } = state.context;
            expect(uiState.currentPage).toBe("server-error");
            expect(uiState.cardMainText).toBe(
              "Error: Invalid or expired token. Please try again."
            );
            service.stop();
            done();
          } catch (error) {
            service.stop();
            done(error);
          }
        }
      })
      .start();

    service.send({ type: "RECEIVE_TOKEN", token: "invalid-token" });
  });

  it("should transition to serverErrorNetwork state with network error", (done) => {
    (getClientId as jest.Mock).mockRejectedValueOnce(new Error("fetch failed"));

    const service = interpret(appMachine)
      .onTransition((state) => {
        if (state.matches("serverErrorNetwork")) {
          try {
            const { uiState } = state.context;
            expect(uiState.currentPage).toBe("server-error");
            expect(uiState.cardMainText).toBe(
              "Error: Unable to reach Google servers. Please wait or retry later."
            );
            service.stop();
            done();
          } catch (error) {
            service.stop();
            done(error);
          }
        }
      })
      .start();

    service.send({ type: "RECEIVE_TOKEN", token: "any-token" });
  });

  it("should transition to serverErrorGeneral state with unexpected error", (done) => {
    (getClientId as jest.Mock).mockRejectedValueOnce(
      new Error("Unexpected error")
    );

    const service = interpret(appMachine)
      .onTransition((state) => {
        if (state.matches("serverErrorGeneral")) {
          try {
            const { uiState } = state.context;
            expect(uiState.currentPage).toBe("server-error");
            expect(uiState.cardMainText).toBe(
              "An unexpected error occurred. Please contact support."
            );
            service.stop();
            done();
          } catch (error) {
            service.stop();
            done(error);
          }
        }
      })
      .start();

    service.send({ type: "RECEIVE_TOKEN", token: "any-token" });
  });
});
