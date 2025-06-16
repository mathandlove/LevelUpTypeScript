import admin from "firebase-admin";
import { defaultRubric, Rubric } from "../common/types";
import { AppContext } from "../common/appTypes";

//Have to call this each session:
//$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\matha\OneDrive\Documents\Consulting\LevelUp\Code\LeveUpBackendNode\functions\src\resources\level-up-firebase-key.json"

// Initialize Firebase Admin SDK (only once)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "level-up-external-server", // Updated to match the new Firestore project
});

const db = admin.firestore();
const RUBRIC_COLLECTION = "rubrics";
const USERS_COLLECTION = "users";

// ✅ Create a copy of an existing rubric
export async function createRubricCopy(
  context: AppContext,
  rubricID: string
): Promise<Rubric> {
  const docRef = db.collection(RUBRIC_COLLECTION).doc(rubricID);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new Error("No such rubric found!");
  }

  const rubric = docSnap.data() as Rubric;
  const newRubricID = await getFreshRubridID();

  const newRubric = {
    ...rubric,
    databaseID: newRubricID,
    lastUpdated: new Date().toISOString(),
  };

  await db.collection(RUBRIC_COLLECTION).doc(newRubricID).set(newRubric);
  return newRubric;
}

// ✅ Create a new rubric with collision detection
export async function newRubric(context: AppContext): Promise<Rubric> {
  const shortID = await getFreshRubridID();
  const rubric: Rubric = { ...context.documentMetaData.defaultRubric };

  rubric.databaseID = shortID;

  try {
    await db.collection(RUBRIC_COLLECTION).doc(shortID).set(rubric);
    //console.log(`✅ Rubric saved with ID: ${shortID}`);
  } catch (error) {
    console.error("❌ Error saving rubric:", error);
  }

  return rubric;
}

// ✅ Get a fresh, unique Rubric ID
async function getFreshRubridID(): Promise<string> {
  let shortID: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    shortID = generateShortID();
    attempts++;
    if (attempts >= maxAttempts) {
      console.error("❌ Too many ID collisions, try increasing ID length.");
      return Promise.reject(
        "Too many ID collisions, try increasing ID length."
      );
    }
  } while (await shortIDExists(shortID));

  return shortID;
}

// ✅ Generate a unique short ID
function generateShortID(length = 5): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let shortID = "";
  for (let i = 0; i < length; i++) {
    shortID += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LVL-${shortID}`;
}

// ✅ Check if an ID already exists
async function shortIDExists(shortID: string): Promise<boolean> {
  const docRef = db.collection(RUBRIC_COLLECTION).doc(shortID);
  const docSnap = await docRef.get();
  return docSnap.exists;
}

// ✅ Retrieve a rubric by ID
export async function installRubric(rubricID: string): Promise<Rubric> {
  const docRef = db.collection(RUBRIC_COLLECTION).doc(rubricID);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new Error("No such rubric found!");
  }

  return docSnap.data() as Rubric;
}

// ✅ Save a user's email and last login timestamp
export async function saveUserToDatabase(email: string) {
  const userToSave = {
    email,
    lastLogin: new Date().toISOString(),
  };

  await db
    .collection(USERS_COLLECTION)
    .doc(email)
    .set(userToSave, { merge: true });
  //console.log(`✅ User email saved: ${email}`);
}

// ✅ Save a rubric to Firestore
export async function saveRubricToDatabase(rubric: Rubric): Promise<Rubric> {
  const rubricToSave = {
    ...rubric,
    googleSheetID: rubric.googleSheetID,
  };

  await db
    .collection(RUBRIC_COLLECTION)
    .doc(rubric.databaseID)
    .set(rubricToSave);
  //console.log("✅ Rubric updated successfully!");
  return rubric;
}

// ✅ Install the default rubric
export async function installDefaultRubric(): Promise<Rubric> {
  return installRubric("starterRubric");
}

// ✅ Create the default rubric (For initial setup)
export async function createDefaultRubric(defaultRubric: Rubric) {
  try {
    await db
      .collection(RUBRIC_COLLECTION)
      .doc(defaultRubric.databaseID)
      .set(defaultRubric);
    //console.log("✅ Default rubric created!");
  } catch (error) {
    console.error("❌ Error creating default rubric:", error);
  }
}
