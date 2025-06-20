import axios from "axios";

import {
  DocumentMetaData,
  defaultDocumentMetaData,
  DocumentMetaDataMap,
  verifyDocumentMetaDataMap,
  Rubric,
} from "../common/types";
import { AppContext } from "../common/appTypes";
import { google } from "googleapis";
import { installDefaultRubric, saveUserToDatabase } from "./dataBaseService";

//Error Messages
// Define custom error classes

interface TokenInfoResponse {
  audience: string;
  email: string;
}

export async function validateToken(context: AppContext): Promise<string> {
  const tokenString = context.appState.token;
  const url = "https://www.googleapis.com/oauth2/v1/tokeninfo";
  let email: string;

  try {
    const response = await axios.post<TokenInfoResponse>(url, {
      access_token: tokenString,
    });
    email = response.data.email;
  } catch (err) {
    console.error("Error validating token:", err.message);
    throw new Error(
      "Google servers sent an invalid token. Please refresh the page and try again."
    );
  }

  // Extract domain from email
  const domain = email?.split("@")[1];
  if (!domain) {
    throw new Error(
      "We don't have access to your Google Account Email adress. We need this to set document permissions to your domain. (e.g. @myscholl.edu)"
    );
  }

  // You can optionally store it in context:
  // context.appState.userDomain = domain;

  return domain;
}

export async function getPersistentDataFileId(context: AppContext): Promise<{
  persistentDataFileId: string;
  levelUpFolderId: string;
  GoogleServices: object;
}> {
  const token = context.appState.token;
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

    const media = {
      mimeType: "application/json",
      body: JSON.stringify({ rubricArray: [], defaultRubric: null }),
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

export async function getRubricArray(
  context: AppContext
): Promise<Array<Rubric>> {
  try {
    const metaDocRecords = await getPersistentDocDataMap(
      context.appState.GoogleServices.oauth2Client,
      context.appState.persistentDataFileId
    );
    //console.log("Retrieved Rubric Array of size: " + metaDocRecords["rubricArray"].length);
    return metaDocRecords["rubricArray"] as Array<Rubric>;
  } catch (error) {
    console.error(
      "Error trying to access persistent data file with ID: " +
        context.appState.persistentDataFileId
    );
    throw error;
  }
}

export async function getOrCreateDefaultRubric(
  context: AppContext
): Promise<Rubric> {
  const metaDocRecords = await getPersistentDocDataMap(
    context.appState.GoogleServices.oauth2Client,
    context.appState.persistentDataFileId
  );
  const drive = context.appState.GoogleServices.drive;
  const metaDefaultRubric = metaDocRecords["defaultRubric"];
  if (metaDefaultRubric != undefined) {
    return metaDefaultRubric;
  } else {
    const defaultRubric = await installDefaultRubric();
    metaDocRecords["defaultRubric"] = defaultRubric;

    try {
      await drive.files.update({
        fileId: context.appState.persistentDataFileId,
        media: {
          mimeType: "application/json",

          body: JSON.stringify(metaDocRecords),
        },
      });
    } catch (error) {
      console.error("Error saving persistent data:", error);
      throw error;
    }

    return defaultRubric;
  }
}

export async function saveRubricArrayToPersistentData(context: AppContext) {
  const oauth2Client = context.appState.GoogleServices.oauth2Client;
  const persistentDataId = context.appState.persistentDataFileId;
  const metaDocRecords = await getPersistentDocDataMap(
    oauth2Client,
    persistentDataId
  );
  const drive = context.appState.GoogleServices.drive;
  metaDocRecords["rubricArray"] = context.documentMetaData.savedRubrics;
  metaDocRecords["defaultRubric"] = context.documentMetaData.defaultRubric;
  await drive.files.update({
    fileId: persistentDataId,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(metaDocRecords),
    },
  });
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

export async function savePersistentArrayData(context: AppContext) {
  const oauth2Client = context.appState.GoogleServices.oauth2Client;
  const persistentDataId = context.appState.persistentDataFileId;
  const drive = context.appState.GoogleServices.drive;
  const metaDocRecords = await getPersistentDocDataMap(
    oauth2Client,
    persistentDataId
  );

  //Save Rubric Array
  metaDocRecords["rubricArray"] = context.documentMetaData.savedRubrics;

  try {
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
  //console.log( `Rubric Array saved to persistent data: ${context.documentMetaData.savedRubrics.length} entries`);
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
    persistentDocData.savedRubrics = []; //Arrays are now being saved for global use.
    persistentDocData.defaultRubric = undefined;
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

  if (savedRubric == null) {
    throw new Error("No rubric found with databaseID: " + databaseID);
  }
  //console.log("returning savedRubric with databaseID:", savedRubric.databaseID);
  return savedRubric || null; // Return the found savedRubric or null if none found
};
