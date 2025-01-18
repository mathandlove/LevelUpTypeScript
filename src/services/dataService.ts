import fetch from "node-fetch";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getClientId(tokenString: string): Promise<string> {
  try {
    const requestBody = JSON.stringify({ access_token: tokenString });
    debugger;
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo",
      {
        method: "POST",
        body: requestBody,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const responseText = await response.text();

    const responseData = JSON.parse(responseText);

    if (responseData.error) {
      throw new AuthError(responseData.error_description || responseData.error);
    }

    if (!response.ok) {
      throw new AuthError("Authentication failed");
    }

    if (!responseData.audience) {
      throw new AuthError("Invalid token response");
    }

    return responseData.audience;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Unexpected Authentication failed");
  }
}
