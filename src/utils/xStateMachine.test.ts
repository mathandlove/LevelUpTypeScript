import { interpret } from "xstate";
import { appMachine } from "../xStateMachine";

describe("App State Machine", () => {
  it("should set clientId and transition to authenticated for valid token", (done) => {
    const mockWs = { send: jest.fn() } as unknown as WebSocket;

    // Start the machine
    const service = interpret(appMachine)
      .onTransition((state) => {
        if (state.matches("authenticated")) {
          // We made it to authenticated, so let's do our checks:
          expect(state.context.clientId).toBe(
            "508326749735-t64udcmgjj2u3h8225nhljkn95vlq4ab.apps.googleusercontent.com"
          );
          done();
        }
      })
      .start();

    // Send RECEIVE_TOKEN with a presumably valid token
    service.send({
      type: "RECEIVE_TOKEN",
      token:
        "ya29.a0ARW5m74ZTIQyFpvjHO1QV5Uq6s1uef1ClVMwMjtA1kd0rLHxSCJwkae0G0_0Zntf7eflBgQrCtHS8u3x_qzTO_PhhdYJSo19e9yw5AuOTN2LM8jaDEXjabIxIjGDAMglnqaExVCrxV3XvWyddGwlkX49v114zEIxx8sUeboyVjw7vD6VQCTMnKoaCgYKAekSARMSFQHGX2MihbSCQ9Vus9yWHLMJGpK7Pg0190",
      ws: mockWs,
    });
  });

  it("should send error message, then reset context", (done) => {
    const mockWs = {
      send: jest.fn(),
    } as unknown as WebSocket;

    const actor = interpret(appMachine).onTransition((state) => {
      if (
        state.matches("initial") &&
        state.history?.matches("loadingClientId")
      ) {
        // 1) Confirm the error message was sent
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: "ERROR",
            payload: {
              code: "AUTH_ERROR",
              message: "Authentication failed",
            },
          })
        );

        done();
      }
    });

    actor.start();
    actor.send({
      type: "RECEIVE_TOKEN",
      token: "invalid-token",
      ws: mockWs,
    });
  });
});
