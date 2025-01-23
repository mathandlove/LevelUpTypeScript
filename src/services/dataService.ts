import fetch, { Response, RequestInit } from "node-fetch";
import { DocumentMetaData, defaultDocumentMetaData } from "../common/types.js";
import { AppContext } from "../stateMachine.js";
import { google } from "googleapis";
import { jwtDecode } from "jwt-decode";

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
  const documentId = context.appState.documentId;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });
  createOrGetPersistentDataFile(oauth2Client);
  /*
  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: "v2",
  });

  const docs = google.docs({ version: "v1", auth: oauth2Client });

  let response = await oauth2.tokeninfo({
    access_token: token,
  });

  console.log("Token Info:", response.data);

  response = await oauth2.userinfo.get();
  console.log("User Info:", response.data);

  const docResponse = await docs.documents.get({
    documentId: documentId,
  });
  console.log("Document Title:", docResponse.data);

  const requests = [
    {
      insertText: {
        text: "Hello, this is newly added text!\n",
        location: {
          index: 1, // Start of the body (after the title)
        },
      },
    },
  ];

  const response4 = await docs.documents.batchUpdate({
    documentId: documentId,
    requestBody: {
      requests,
    },
  });
  console.log("Text inserted successfully:", response4.data);
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const response6 = await drive.files.list({
    fields: "files(id, name)",
  });
  */

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

async function createOrGetPersistentDataFile(oauth2Client: any) {
  console.log("Creating or getting persistent data file");
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const fileName = "LevelUpPersistentData.json"; // The file's name in Google Drive
  const initialData = {
    score: 0,
    topics: [],
    challengeArray: [],
  }; // The data to store in the JSON file

  try {
    // Check if the file already exists
    const listResponse = await drive.files.list({
      q: `name='${fileName}' and trashed=false`, // Search for the file by name and exclude trashed files
      fields: "files(id, name)", // Return file ID and name
      spaces: "drive", // Search in the user's Drive
    });

    const files = listResponse.data.files;

    if (files && files.length > 0) {
      console.log(`File already exists. File ID: ${files[0].id}`);
      return files[0].id; // Return the existing file's ID
    }

    // If the file doesn't exist, create a new one
    const fileMetadata = {
      name: fileName, // File name
      mimeType: "application/json", // MIME type for JSON
    };

    const media = {
      mimeType: "application/json",
      body: JSON.stringify(initialData), // File content as JSON string
    };

    const createResponse = await drive.files.create({
      requestBody: fileMetadata, // Metadata
      media: media, // File content
      fields: "id", // Return only the file ID
    });

    console.log(
      `File created successfully. File ID: ${createResponse.data.id}`
    );
    return createResponse.data.id; // Return the file ID for further use
  } catch (error) {
    console.error("Error handling persistentDataFile:", error.message);
    throw error; // Re-throw error for handling elsewhere
  }
}
