var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import fetch from "node-fetch";
import { defaultDocumentMetaData, verifyDocumentMetaDataMap, } from "../common/types.js";
import { google } from "googleapis";
export function validateToken(context) {
    return __awaiter(this, void 0, void 0, function* () {
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
            const response = yield fetchWithRetriesAndTimeout(url, options);
            return true;
        }
        catch (_a) {
            throw new Error("Google servers sent an invalid token. Please refresh the page and try again.");
        }
    });
}
export function getPersistentDataFileId(context) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = context.appState.token;
        const documentId = context.appState.documentId;
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });
        const { persistentDataFileId, levelUpFolderId } = yield createOrGetPersistentDataFileId(oauth2Client);
        const GoogleServices = {
            oauth2Client,
            drive: google.drive({ version: "v3", auth: oauth2Client }),
            docs: google.docs({ version: "v1", auth: oauth2Client }),
            sheets: google.sheets({ version: "v4", auth: oauth2Client }),
        };
        return { persistentDataFileId, levelUpFolderId, GoogleServices };
    });
}
export function getOrLoadDocumentMetaData(context) {
    return __awaiter(this, void 0, void 0, function* () {
        let createdPersistentDataFile = false;
        try {
            const oauth2Client = context.appState.GoogleServices.oauth2Client;
            const documentId = context.appState.documentId;
            const persistentDataFileId = context.appState.persistentDataFileId;
            //Find Storage Location
            //load persistent Doc data
            let persistentDocData = yield getPersistentDocData(oauth2Client, documentId, persistentDataFileId);
            if (persistentDocData == null) {
                persistentDocData = defaultDocumentMetaData; //Now we are guranteed to have the right challengeArray size!
                createdPersistentDataFile = true;
            }
            return { persistentDocData, createdPersistentDataFile };
        }
        catch (error) {
            throw "We do not have permission to access your Google Documents. <br><br>Make sure you have editting rights to the document you are working on.";
        }
    });
}
function fetchWithRetriesAndTimeout(url_1) {
    return __awaiter(this, arguments, void 0, function* (url, options = {}) {
        const { retries = 3, timeout = 5000 } = options, fetchOptions = __rest(options, ["retries", "timeout"]);
        const fetchWithTimeout = (url, options, timeout) => {
            return Promise.race([
                fetch(url, options),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), timeout)),
            ]);
        };
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = yield fetchWithTimeout(url, fetchOptions, timeout);
                if (!response.ok) {
                    throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
                }
                // Assume response.json() returns data of type T
                return (yield response.json());
            }
            catch (error) {
                if (attempt < retries - 1) {
                    console.warn(`Fetch attempt ${attempt + 1} failed. Retrying...`, error.message);
                }
                else {
                    console.error(`All fetch attempts failed:`, error.message);
                    throw error;
                }
            }
        }
        // This line is unreachable, but TypeScript requires it.
        throw new Error("Fetch operation failed unexpectedly.");
    });
}
function createOrGetPersistentDataFileId(oauth2Client) {
    return __awaiter(this, void 0, void 0, function* () {
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        const fileName = "persistent.json"; // The file's name in Google Drive
        try {
            const folderId = yield createOrGetFolder(oauth2Client, "LevelUp");
            // Check if the file already exists
            const listResponse = yield drive.files.list({
                q: `name='${fileName}' and trashed=false`, // Search for the file by name and exclude trashed files
                fields: "files(id, name)", // Return file ID and name
                spaces: "drive", // Search in the user's Drive
            });
            const files = listResponse.data.files;
            if (files && files.length > 0) {
                console.log(`File already exists. File ID: ${files[0].id}`);
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
            const media = {
                mimeType: "application/json",
                body: JSON.stringify({}),
            };
            const createResponse = yield drive.files.create({
                requestBody: fileMetadata, // Metadata
                media: media, // File content
                fields: "id", // Return only the file ID
            });
            console.log(`File created successfully. File ID: ${createResponse.data.id}`);
            return {
                persistentDataFileId: createResponse.data.id,
                levelUpFolderId: folderId,
            }; // Return the file ID for further use
        }
        catch (error) {
            console.error("Error handling persistentDataFile:", error.message);
            throw error; // Re-throw error for handling elsewhere
        }
        function createOrGetFolder(oauth2Client, folderName) {
            return __awaiter(this, void 0, void 0, function* () {
                const drive = google.drive({ version: "v3", auth: oauth2Client });
                try {
                    // Check if the folder already exists
                    const listResponse = yield drive.files.list({
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
                    const createResponse = yield drive.files.create({
                        requestBody: folderMetadata, // Metadata for the folder
                        fields: "id, name", // Return the folder ID and name
                    });
                    return createResponse.data.id; // Return the folder ID
                }
                catch (error) {
                    console.error("Error creating folder:", error.message);
                    throw error;
                }
            });
        }
    });
}
function getPersistentDocData(oauth2Client, documentId, persistentDataId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const metaDocRecords = yield getPersistentDocDataMap(oauth2Client, persistentDataId);
            if (metaDocRecords[documentId] != null) {
                return metaDocRecords[documentId];
            }
            else {
                return null;
            }
        }
        catch (error) {
            console.error("We do not have a persistent reference file in the Level Up Folder. Please restart.");
            throw error;
        }
    });
}
function getPersistentDocDataMap(oauth2Client, persistentDataId) {
    return __awaiter(this, void 0, void 0, function* () {
        const drive = google.drive({ version: "v3", auth: oauth2Client });
        const metaDocRecords = yield drive.files.get({
            fileId: persistentDataId,
            alt: "media",
        });
        if (verifyDocumentMetaDataMap(metaDocRecords.data)) {
            return metaDocRecords.data;
        }
        else {
            console.log("Persistent data is corrupted or not found. Resetting to default.");
            return {};
        }
    });
}
export function savePersistentDocData(context) {
    return __awaiter(this, void 0, void 0, function* () {
        //We do not neeed to save the document text as it is already saved in the google doc.
        const oauth2Client = context.appState.GoogleServices.oauth2Client;
        const documentId = context.appState.documentId;
        const persistentDataId = context.appState.persistentDataFileId;
        const levelUpFolderId = context.appState.levelUpFolderId;
        const persistentDocData = Object.assign({}, context.documentMetaData);
        const drive = context.appState.GoogleServices.drive;
        persistentDocData.currentText = "";
        persistentDocData.textBeforeEdits = "";
        persistentDocData.selectedChallengeNumber = -1;
        const metaDocRecords = yield getPersistentDocDataMap(oauth2Client, persistentDataId);
        metaDocRecords[documentId] = persistentDocData;
        yield drive.files.update({
            fileId: persistentDataId,
            media: {
                mimeType: "application/json",
                body: JSON.stringify(metaDocRecords),
            },
        });
        console.log(`Document ID '${documentId}' saved successfully.`);
    });
}
//# sourceMappingURL=dataService.js.map