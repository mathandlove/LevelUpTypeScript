import fetch, { Response, RequestInit } from "node-fetch";
import {
  DocumentMetaData,
  defaultDocumentMetaData,
  DocumentMetaDataMap,
  verifyDocumentMetaDataMap,
  Rubric,
} from "../common/types.js";
import { AppContext } from "../stateMachine.js";
import { google } from "googleapis";
import { jwtDecode } from "jwt-decode";
import { getDefaultRubric } from "./dataBaseService.js";

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

export async function getPersistentDataFileId(context: AppContext): Promise<{
  persistentDataFileId: string;
  levelUpFolderId: string;
  GoogleServices: object;
}> {
  const token = context.appState.token;
  const documentId = context.appState.documentId;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });

  const { persistentDataFileId, levelUpFolderId } =
    await createOrGetPersistentDataFileId(oauth2Client);

  const GoogleServices = {
    oauth2Client,
    drive: google.drive({ version: "v3", auth: oauth2Client }),
    docs: google.docs({ version: "v1", auth: oauth2Client }),
    sheets: google.sheets({ version: "v4", auth: oauth2Client }),
  };
  return { persistentDataFileId, levelUpFolderId, GoogleServices };
}

export async function getOrLoadDocumentMetaData(context: AppContext): Promise<{
  persistentDocData: DocumentMetaData;
  createdPersistentDataFile: boolean;
}> {
  let createdPersistentDataFile = false;
  try {
    const oauth2Client = context.appState.GoogleServices.oauth2Client;
    const documentId = context.appState.documentId;
    const persistentDataFileId = context.appState.persistentDataFileId;

    //Find Storage Location

    //load persistent Doc data
    let persistentDocData = await getPersistentDocData(
      oauth2Client,
      documentId,
      persistentDataFileId
    );
    if (persistentDocData == null) {
      persistentDocData = defaultDocumentMetaData; //Now we are guranteed to have the right challengeArray size!

      //Used to getAll Rubrics - have delegated this to a separate function for clarity
      createdPersistentDataFile = true;
    }
    return { persistentDocData, createdPersistentDataFile };
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
async function createOrGetPersistentDataFileId(oauth2Client: any): Promise<{
  persistentDataFileId: string;
  levelUpFolderId: string;
}> {
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const fileName = "persistent.json"; // The file's name in Google Drive
  try {
    const folderId = await createOrGetFolder(oauth2Client, "LevelUp");
    // Check if the file already exists
    const listResponse = await drive.files.list({
      q: `name='${fileName}' and trashed=false`, // Search for the file by name and exclude trashed files
      fields: "files(id, name)", // Return file ID and name
      spaces: "drive", // Search in the user's Drive
    });

    const files = listResponse.data.files;

    if (files && files.length > 0) {
      return {
        persistentDataFileId: files[0].id,
        levelUpFolderId: folderId,
      }; // Return the existing file's ID
    }

    // If the file doesn't exist, create a new one
    const fileMetadata = {
      name: fileName, // File name
      mimeType: "application/json", // MIME type for JSON
      parents: [folderId],
    };

    //We will always be uploading the entire array system so we need to upload the default rubric.
    const defaultRubric = await getDefaultRubric();
    defaultRubric.title = "Starter Rubric";
    const media = {
      mimeType: "application/json",
      body: JSON.stringify({ rubricArray: [defaultRubric] }),
    };

    const createResponse = await drive.files.create({
      requestBody: fileMetadata, // Metadata
      media: media, // File content
      fields: "id", // Return only the file ID
    });

    return {
      persistentDataFileId: createResponse.data.id,
      levelUpFolderId: folderId,
    }; // Return the file ID for further use
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

      return createResponse.data.id; // Return the folder ID
    } catch (error) {
      console.error("Error creating folder:", error.message);
      throw error;
    }
  }
}

async function getAllRubrics(
  oauth2Client: any,
  persistentDataId: string
): Promise<Array<Rubric>> {
  try {
    const metaDocRecords = await getPersistentDocDataMap(
      oauth2Client,
      persistentDataId
    );
    return metaDocRecords["rubricArray"] as Array<Rubric>;
  } catch (error) {
    console.error(
      "Error trying to access persistent data file with ID: " + persistentDataId
    );
    throw error;
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
      const persistentDocData = metaDocRecords[documentId] as DocumentMetaData;
      return persistentDocData;
    } else {
      return null;
    }
  } catch (error) {
    console.error(
      "Error trying to access persistent data file with ID: " + persistentDataId
    );
    throw error;
  }
}

async function getPersistentDocDataMap(
  oauth2Client: any,
  persistentDataId: string
): Promise<DocumentMetaDataMap | null> {
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
    return null;
  }
}

export async function savePersistentDocData(context: AppContext) {
  //We do not neeed to save the document text as it is already saved in the google doc.
  try {
    const oauth2Client = context.appState.GoogleServices.oauth2Client;
    const documentId = context.appState.documentId;
    const persistentDataId = context.appState.persistentDataFileId;

    const metaDocRecords = await getPersistentDocDataMap(
      oauth2Client,
      persistentDataId
    );

    const persistentDocData = { ...context.documentMetaData };
    const drive = context.appState.GoogleServices.drive;
    persistentDocData.currentText = "";
    persistentDocData.textBeforeEdits = "";
    persistentDocData.savedRubrics = []; //Arrays are now being saved for global
    persistentDocData.selectedChallengeNumber = -1;

    if (metaDocRecords == null) {
      console.error("Attempted to save file, but it was not found.");
    }

    metaDocRecords[documentId] = persistentDocData;

    await drive.files.update({
      fileId: persistentDataId,
      media: {
        mimeType: "application/json",
        body: JSON.stringify(metaDocRecords),
      },
    });
  } catch (error) {
    console.error("Error saving persistent data:", error);
    throw error;
  }
}

export const getRubric = (context: AppContext, databaseID: string) => {
  // Check if the defaultRubric matches the databaseId
  if (context.documentMetaData.defaultRubric?.databaseID === databaseID) {
    return context.documentMetaData.defaultRubric;
  }

  // Look through savedRubrics to find the rubric that matches the databaseId
  const savedRubric = context.documentMetaData.savedRubrics?.find(
    (rubric) => rubric.databaseID === databaseID
  );

  console.error("No rubric found with databaseID: " + databaseID); //I could load it from the database, but I hope to never have a reference to a non existent savedFile, so this should never get here.

  return savedRubric || null; // Return the found savedRubric or null if none found
};
