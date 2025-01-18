import { getClientId } from "../services/dataService";
import tokenData from "../utils/tokenData.json";

describe("Integration Test with Google OAuth Endpoint", () => {
  it("should make a live call to Google and retrieve the audience (clientId)", async () => {
    // Make sure you have set TEST_GOOGLE_TOKEN in your environment
    const token = tokenData.token;
    if (!token) {
      throw new Error("TEST_GOOGLE_TOKEN not set in environment");
    }

    let clientId: string | undefined;
    try {
      clientId = await getClientId(token);
    } catch (error) {
      console.error("Failed to retrieve clientId from Google:", error);
      throw error;
    }

    // This depends on your actual Google account / test token audience
    expect(clientId).toBeDefined();
    // Optionally, you can match a known clientId if you trust the test token
    // expect(clientId).toBe("your-expected-client-id");
  });
});
