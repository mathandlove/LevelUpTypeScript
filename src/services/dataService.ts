import fetch, { Response, RequestInit } from "node-fetch";
import { DocumentMetaData, defaultDocumentMetaData } from "../common/types.js";
import { AppContext } from "../stateMachine.js";

//Error Messages
// Define custom error classes

interface TokenInfoResponse {
  audience: string;
}

export async function getClientId(tokenString: string): Promise<string> {
  const requestBody = JSON.stringify({ access_token: tokenString });
  const url = "https://www.googleapis.com/oauth2/v1/tokeninfo";
  const options = {
    method: "POST",
    body: requestBody,
    headers: {
      "Content-Type": "application/json",
    },
  };
  try {
    const response: TokenInfoResponse = await fetchWithRetriesAndTimeout(
      url,
      options
    );
    return response.audience;
  } catch {
    throw new Error(
      "Google servers sent an invalid token. Please refresh the page and try again."
    );
  }
}

export async function getDocumentMetaData(
  context: AppContext
): Promise<DocumentMetaData> {
  const token = context.appState.token;
  return defaultDocumentMetaData;
}

interface FetchOptions extends RequestInit {
  retries?: number; // Number of retry attempts
  timeout?: number; // Timeout in milliseconds
}

async function fetchWithRetriesAndTimeout<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { retries = 3, timeout = 5000, ...fetchOptions } = options;

  const fetchWithTimeout = (
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> => {
    return Promise.race([
      fetch(url, options),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeout)
      ),
    ]);
  };
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions, timeout);

      if (!response.ok) {
        throw new Error(
          `Fetch error: ${response.status} ${response.statusText}`
        );
      }

      // Assume response.json() returns data of type T
      return (await response.json()) as T;
    } catch (error) {
      if (attempt < retries - 1) {
        console.warn(
          `Fetch attempt ${attempt + 1} failed. Retrying...`,
          (error as Error).message
        );
      } else {
        console.error(`All fetch attempts failed:`, (error as Error).message);
        throw error;
      }
    }
  }

  // This line is unreachable, but TypeScript requires it.
  throw new Error("Fetch operation failed unexpectedly.");
}
