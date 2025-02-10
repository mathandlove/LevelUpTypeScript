import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "../resources/keys.js";
import { defaultRubric, Rubric } from "../common/types.js";
import { AppContext } from "../common/appTypes.js";
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function createRubricCopy(
  context: AppContext,
  rubricID: string
): Promise<Rubric> {
  const docRef = doc(db, "rubrics", rubricID);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error("No such rubric found!");
  }
  const rubric = docSnap.data() as Rubric;

  const newRubricID = await getFreshRubridID();

  const newRubric = {
    ...rubric,
    databaseID: newRubricID, // If your schema has an "id" field, update it
    lastUpdated: new Date().toISOString(), // Optionally update timestamp
  };
  const newDocRef = doc(db, "rubrics", newRubricID);
  await setDoc(newDocRef, newRubric);
  return newRubric;
}
// Function to create a rubric with collision detection
export async function newRubric(context: AppContext): Promise<Rubric> {
  const shortID = await getFreshRubridID();

  const rubric: Rubric = {
    ...context.documentMetaData.defaultRubric,
  }; //THe first Rubric is our default rubric ALWAYS>
  //TODO Need to change the Title at some point which requires a google call.
  // Define the rubric data
  rubric.databaseID = shortID;

  try {
    await setDoc(doc(db, "rubrics", shortID), rubric);
    console.log(`✅ Rubric saved with ID: ${shortID}`);
  } catch (error) {
    console.error("❌ Error saving rubric:", error);
  }

  return rubric;
  // Function to generate a 5-character short ID
}

async function getFreshRubridID(): Promise<string> {
  let shortID: string;
  let attempts = 0;

  const maxAttempts = 10; // Prevent infinite loops in rare cases

  // Keep generating new short IDs until we find an unused one
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

  function generateShortID(length = 5): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let shortID = "";
    for (let i = 0; i < length; i++) {
      shortID += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `LVL-${shortID}`;
  }

  // Function to check if the short ID already exists in Firestore
  async function shortIDExists(shortID: string): Promise<boolean> {
    const docRef = doc(db, "rubrics", shortID);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  }
}

export async function installRubric(rubricID: string): Promise<Rubric> {
  const docRef = doc(db, "rubrics", rubricID);
  const docSnap = await getDoc(docRef);
  let rubric: Rubric;
  if (docSnap.exists()) {
    rubric = docSnap.data() as Rubric;
    return rubric;
  } else {
    throw new Error("No such rubric found!");
  }
}

export async function saveRubricToDatabase(rubric: Rubric): Promise<Rubric> {
  const rubricToSave = {
    ...rubric,
    googleSheetID: rubric.googleSheetID,
  };
  //Assuming all Rubrics are created with newRubric().
  const rubricID = rubric.databaseID;
  await setDoc(doc(db, "rubrics", rubricID), rubricToSave);

  console.log("✅ Rubric updated successfully!");
  return rubric;
}

export async function installDefaultRubric(): Promise<Rubric> {
  const rubric = await installRubric("starterRubric");
  return rubric;
}

//only used as programmer
//npm run rubric
export async function createDefaultRubric(defaultRubric: Rubric) {
  try {
    await setDoc(doc(db, "rubrics", defaultRubric.databaseID), defaultRubric);
    console.log("✅ Default rubric created!");
  } catch (error) {
    console.error("❌ Error creating default rubric:", error);
  }
}

// Run this function once to create the default rubric
