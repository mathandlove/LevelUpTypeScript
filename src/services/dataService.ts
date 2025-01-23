import fetch, { Response, RequestInit } from "node-fetch";
import {
  DocumentMetaData,
  defaultDocumentMetaData,
  DocumentMetaDataMap,
  verifyDocumentMetaDataMap,
} from "../common/types.js";
import { AppContext } from "../stateMachine.js";
import { google } from "googleapis";
import { jwtDecode } from "jwt-decode";

//Error Messages
// Define custom error classes

interface TokenInfoResponse {
  audience: string;
}

export async function validateToken(context: AppContext): Promise<boolean> {
  const tokenString = context.appState.token;
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
    return true;
  } catch {
    throw new Error(
      "Google servers sent an invalid token. Please refresh the page and try again."
    );
  }
}
export async function getPersistentDataFileId(
  context: AppContext
): Promise<string> {
  let persistentDataFileId = context.appState.persistentDataFileId;
  if (!persistentDataFileId) {
    const token = context.appState.token;
    const documentId = context.appState.documentId;
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    persistentDataFileId = await createOrGetPersistentDataFileId(oauth2Client);
  }
  return persistentDataFileId;
}

export async function getOrLoadDocumentMetaData(
  context: AppContext
): Promise<DocumentMetaData> {
  if (context.documentMetaData != null) {
    return context.documentMetaData;
  }
  try {
    const token = context.appState.token;
    const documentId = context.appState.documentId;
    const oauth2Client = new google.auth.OAuth2();
    const persistentDataFileId = context.appState.persistentDataFileId;
    oauth2Client.setCredentials({ access_token: token });

    //Find Storage Location

    //load persistent Doc data
    let persistentDocData = await getPersistentDocData(
      oauth2Client,
      documentId,
      persistentDataFileId
    );
    if (persistentDocData == null) {
      persistentDocData = defaultDocumentMetaData;
      savePersistentDocData(
        oauth2Client,
        documentId,
        persistentDataFileId,
        persistentDocData
      );
    }
    return persistentDocData;
  } catch (error) {
    throw "We do not have permission to access your Google Documents. <br><br>Make sure you have editting rights to the document you are working on.";
  }
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
async function createOrGetPersistentDataFileId(oauth2Client: any) {
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const fileName = "persistent.json"; // The file's name in Google Drive
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

    const folderId = await createOrGetFolder(oauth2Client, "LevelUp");
    // If the file doesn't exist, create a new one
    const fileMetadata = {
      name: fileName, // File name
      mimeType: "application/json", // MIME type for JSON
      parents: [folderId],
    };

    const media = {
      mimeType: "application/json",
      body: JSON.stringify({}),
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

  async function createOrGetFolder(oauth2Client: any, folderName: string) {
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    try {
      // Check if the folder already exists
      const listResponse = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name)", // Return file ID and name
        spaces: "drive",
      });

      const files = listResponse.data.files;

      if (files && files.length > 0) {
        console.log(`Folder already exists. Folder ID: ${files[0].id}`);
        return files[0].id; // Return the existing folder's ID
      }

      // If the folder doesn't exist, create a new one
      const folderMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder", // This specifies it's a folder
      };

      const createResponse = await drive.files.create({
        requestBody: folderMetadata, // Metadata for the folder
        fields: "id, name", // Return the folder ID and name
      });

      console.log(
        `Folder created successfully. ID: ${createResponse.data.id}, Name: ${createResponse.data.name}`
      );
      return createResponse.data.id; // Return the folder ID
    } catch (error) {
      console.error("Error creating folder:", error.message);
      throw error;
    }
  }
}

async function getPersistentDocData(
  oauth2Client: any,
  documentId: string,
  persistentDataId: string
): Promise<DocumentMetaData> {
  try {
    const metaDocRecords = await getPersistentDocDataMap(
      oauth2Client,
      persistentDataId
    );
    if (metaDocRecords[documentId] != null) {
      return metaDocRecords[documentId];
    } else {
      return null;
    }
  } catch (error) {
    console.error(
      "We do not have a persistent reference file in the Level Up Folder. Please restart."
    );
    throw error;
  }
}

async function getPersistentDocDataMap(
  oauth2Client: any,
  persistentDataId: string
): Promise<DocumentMetaDataMap> {
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const metaDocRecords = await drive.files.get({
    fileId: persistentDataId,
    alt: "media",
  });
  if (verifyDocumentMetaDataMap(metaDocRecords.data)) {
    return metaDocRecords.data;
  } else {
    console.log(
      "Persistent data is corrupted or not found. Resetting to default."
    );
    return {};
  }
}

async function savePersistentDocData(
  oauth2Client: any,
  documentId: string,
  persistentDataId: string,
  persistentDocData: DocumentMetaData
) {
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const metaDocRecords = await getPersistentDocDataMap(
    oauth2Client,
    persistentDataId
  );
  metaDocRecords[documentId] = persistentDocData;
  console.log("metaDocRecords", metaDocRecords);
  console.log(
    "verifyDocumentMetaDataMap",
    verifyDocumentMetaDataMap(metaDocRecords)
  );
  await drive.files.update({
    fileId: persistentDataId,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(metaDocRecords),
    },
  });

  console.log(`Document ID '${documentId}' saved successfully.`);
}
