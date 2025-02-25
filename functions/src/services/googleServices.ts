import { AppContext } from "../common/appTypes";
import { Reflection, Rubric, Topic } from "../common/types";
const { google } = require("googleapis");

async function canAccessDocument(docId, auth) {
  try {
    // Set up the Drive client with the given auth
    // (which must have the drive.metadata.readonly or broader scope).
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document'",
      fields: "files(id, name)",
      pageSize: 100,
    });

    const files = res.data.files || [];
    const found = files.find((file) => file.id === docId);

    if (found) {
      console.log(`You have access to: ${found.name} (${found.id})`);
      return true;
    } else {
      console.log(
        `Doc ID ${docId} was not found in the first page of docs you have access to.`
      );
      return false;
    }
  } catch (error) {
    console.error("Error checking access to document:", error);
    return false;
  }
}

export async function getFullText(context: AppContext): Promise<string> {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;
  let body = null;
  try {
    // Replace this with your actual docId from context (or a test ID).
    const docId = context.appState.documentId;
    console.log("Attempting to fetch doc with ID:", docId);
    await canAccessDocument(docId, GoogleServices.oauth2Client);
    // This call will fail if you only have document-current scope
    // and you're trying to fetch a doc that isn't covered by that scope.
    const response = await docs.documents.get({
      documentId: docId,
    });
    body = response.data.body?.content;
    console.log("Document fetch successful. Response data:", response.data);
  } catch (error) {
    console.error("Error fetching document:", error);
    // Often, the error will indicate insufficient scopes or forbidden access.
  }

  if (!body) {
    throw new Error("You need text in this document to edit it!");
  }
  const text = body
    .map((element) => {
      if (element.paragraph?.elements) {
        return element.paragraph.elements
          .map((elem) => elem.textRun?.content || "")
          .join("");
      }
      return "";
    })
    .join("");

  if (!hasEnoughSentences(text, 5)) {
    throw new Error(
      "We can't offer feedback on your paper until it has at least 5 complete sentences.\n\n\n Open this back up when you are ready!"
    );
  }
  console.log(text);
  return text;

  function hasEnoughSentences(text: string, minSentences: number): boolean {
    const sentenceRegex = /[^.!?]+[.!?]/g; // Matches sentences ending with ., ?, or !
    const sentences = text.match(sentenceRegex); // Get all matching sentences
    return sentences ? sentences.length >= minSentences : false;
  }
}

export async function highlightChallengeSentence(context: AppContext) {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;

  // Get document details
  const doc = await docs.documents.get({
    documentId: context.appState.documentId,
  });

  const startIndex =
    context.documentMetaData.currentChallenge?.currentSentenceCoordinates
      ?.startIndex + 1; // +1 because the index is 0 based
  console.log(`highlight Sentence starting at ${startIndex}`);
  const endIndex =
    context.documentMetaData.currentChallenge?.currentSentenceCoordinates
      ?.endIndex + 1; // +1 because the index is 0 based

  const docEndIndex = doc.data.body.content.reduce((acc, element) => {
    if (element.endIndex) {
      return Math.max(acc, element.endIndex);
    }
    return acc;
  }, 0);

  // BatchUpdate request to highlight text
  if (!startIndex || !endIndex) {
    console.error("No start or end index found for challenge sentence.");
    throw new Error("We are having trouble accessing your Google Document.");
  }

  const request = {
    requests: [
      // Clear all highlights in the document

      {
        updateTextStyle: {
          range: {
            startIndex: 1, // Start at 1 to avoid the first section break
            endIndex: docEndIndex, // End of the document
          },
          textStyle: {
            backgroundColor: {
              color: null, // Remove any background color
            },
          },
          fields: "backgroundColor",
        },
      },
      // Apply highlight to the desired range
      {
        updateTextStyle: {
          range: {
            startIndex,
            endIndex,
          },
          textStyle: {
            backgroundColor: {
              color: {
                rgbColor: {
                  red: 0.675, // Pale azure blue
                  green: 0.847,
                  blue: 0.902,
                },
              },
            },
          },
          fields: "backgroundColor",
        },
      },
    ],
  };

  try {
    // Send the batchUpdate request
    const response = await docs.documents.batchUpdate({
      documentId: context.appState.documentId,
      requestBody: request,
    });
  } catch (error) {
    console.warn("Error highlighting text:", error);
  }
}
export async function createGoogleSheet(
  context: AppContext,
  rubric: Rubric
): Promise<Rubric> {
  //function will save created rubric as googleSheetId and pass back the rubric.
  try {
    const { GoogleServices } = context.appState;
    const { sheets, drive } = GoogleServices;
    if (rubric.googleSheetID && rubric.googleSheetID != "") {
      return rubric;
    }

    // Step 1: Create a new Google Sheet

    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: rubric.title,
        },
      },
    });
    const spreadsheetId = response.data.spreadsheetId;
    rubric.googleSheetID = spreadsheetId;
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: context.appState.levelUpFolderId,
      removeParents: "root",
      fields: "id, parents",
    });
    //const spreadsheetId = "1wywByFIX6LYYB0MK958a3iXKpIXObSWa4l3R8npyPeE";

    // Step 3: Populate the sheet with data
    const values = [
      ["Rubric Title: ", rubric.title],
      ["Grade Level: ", rubric.gradeLevel],
      [
        "Goal Name",
        "Description",
        "Required Levels",
        "Include Reflection?",
        "Ask to explain Copy/Paste?",
        "Question 1",
        "Question 2",
        "Question 3",
        "Question 4",
        "Question 5",
      ],
      [
        "Reflection",
        "Help students reflect on their writing journey.",
        "1",
        "Yes",
        "Yes",
        ...rubric.reflection.question,
      ],
      [],
      [
        "Goal Name",
        "Description",
        "Required Levels",
        "Student Goal 1",
        "Student Goal 2",
        "Student Goal 3",
      ],
      // Dynamically add topics

      ...rubric.topics.map((topic) => [
        topic.title,
        topic.description,
        topic.outOf,
        topic.studentGoalArray[0],
        topic.studentGoalArray[1],
        topic.studentGoalArray[2],
        "",
        "",
        "",
        "",
        "",
      ]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet1!A1:K10",
      valueInputOption: "RAW",
      requestBody: { values },
    });

    // Step 4: Apply Formatting (Column Widths, Row Heights, Background Colors, Text Styling)
    const formatRequest = {
      requests: [
        // Protect Column 0 (Column A)
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId: 0,
                startColumnIndex: 0,
                endColumnIndex: 1,
                startRowIndex: 0,
                endRowIndex: 4,
              },
              description: "Protected Column A",
              warningOnly: true, // No one can edit except owner
            },
          },
        },
        // Protect Row 2
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId: 0,
                startRowIndex: 2,
                endRowIndex: 3,
              },
              description: "Protected Row 3",
              warningOnly: true,
            },
          },
        },
        // Protect Row 5
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId: 0,
                startRowIndex: 5,
                endRowIndex: 6,
              },
              description: "Protected Row 6",
              warningOnly: true,
            },
          },
        },

        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startColumnIndex: 0, // Column A (0-based index)
              endColumnIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
            },
            cell: {
              userEnteredFormat: {
                verticalAlignment: "MIDDLE",
                horizontalAlignment: "CENTER",
                textFormat: {
                  fontFamily: "Roboto",
                  fontSize: 14,
                },
                wrapStrategy: "WRAP",
              },
            },
            fields:
              "userEnteredFormat(verticalAlignment, horizontalAlignment, textFormat.fontFamily, textFormat.fontSize, wrapStrategy)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 6, // Row 5 (0-based index)
              endRowIndex: 16,
              startColumnIndex: 0, // Column C (0-based index)
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 191 / 255,
                  green: 226 / 255,
                  blue: 236 / 255,
                },
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 0, // Column A (0-based index)
              endColumnIndex: 10, // Column J (0-based index)
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 212 / 255,
                  green: 241 / 255,
                  blue: 204 / 255,
                },
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 2, // Row 3 (0-based index)
              endRowIndex: 3,
              startColumnIndex: 0, // Column A (0-based index)
              endColumnIndex: 10, // Column J (0-based index)
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 56 / 255,
                  green: 118 / 255,
                  blue: 29 / 255,
                },
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 5, // Row 3 (0-based index)
              endRowIndex: 6,
              startColumnIndex: 0, // Column A (0-based index)
              endColumnIndex: 6, // Column J (0-based index)
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 44 / 255,
                  green: 82 / 255,
                  blue: 115 / 255,
                },
              },
            },
            fields: "userEnteredFormat.backgroundColor",
          },
        },

        // Column widths
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 1,
            },
            properties: { pixelSize: 164 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "COLUMNS",
              startIndex: 1,
              endIndex: 2,
            },
            properties: { pixelSize: 287 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "COLUMNS",
              startIndex: 2,
              endIndex: 3,
            },
            properties: { pixelSize: 99 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "COLUMNS",
              startIndex: 3,
              endIndex: 10,
            },
            properties: { pixelSize: 120 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: "ROWS", startIndex: 3 },
            properties: { pixelSize: 85 },
            fields: "pixelSize",
          },
        },
        // Row heights
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: 0,
              endIndex: 3,
            },
            properties: { pixelSize: 50 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: 4,
              endIndex: 5,
            },
            properties: { pixelSize: 25 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId: 0,
              dimension: "ROWS",
              startIndex: 5,
              endIndex: 6,
            },
            properties: { pixelSize: 50 },
            fields: "pixelSize",
          },
        },

        {
          updateCells: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 4, // Column D (0-based index)
              endColumnIndex: 5,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      boolValue: rubric.reflection.copyPercentIncluded, // Default unchecked, set to true for checked
                    },
                    dataValidation: {
                      condition: {
                        type: "BOOLEAN",
                      },
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,dataValidation",
          },
        },
        {
          //adding checkbox for Includ Reflection
          updateCells: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 3, // Column D (0-based index)
              endColumnIndex: 4,
            },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: {
                      boolValue: rubric.reflection.enabled, // Default unchecked, set to true for checked
                    },
                    dataValidation: {
                      condition: {
                        type: "BOOLEAN",
                      },
                    },
                  },
                ],
              },
            ],
            fields: "userEnteredValue,dataValidation",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 2, // Row 3 (0-based index)
              endRowIndex: 3,
              startColumnIndex: 0,
              endColumnIndex: 10,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  foregroundColor: {
                    red: 1.0,
                    green: 1.0,
                    blue: 1.0,
                  },
                  fontSize: 12,
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat(textFormat)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 5, // Row 3 (0-based index)
              endRowIndex: 6,
              startColumnIndex: 0,
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  foregroundColor: {
                    red: 1.0,
                    green: 1.0,
                    blue: 1.0,
                  },
                  fontSize: 12,
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat(textFormat)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 0, // Row 1 (0-based index)
              endRowIndex: 2, // Row 2 (0-based index, exclusive)
              startColumnIndex: 0, // Column B (0-based index)
              endColumnIndex: 2,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "RIGHT",
                textFormat: {
                  fontSize: 12,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
        // Right-align row 4 and below in column B
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 1, // Column B
              endColumnIndex: 2,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 11,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 6, // Row 5 (0-based index)
              endRowIndex: 16,
              startColumnIndex: 3, // Column C (0-based index)
              endColumnIndex: 6,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 10,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },

        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 6, // Row 4 (0-based index)
              endRowIndex: 20,
              startColumnIndex: 1, // Column B
              endColumnIndex: 2,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 11,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 0, // Row 4 (0-based index)
              endRowIndex: 2,
              startColumnIndex: 1, // Column B
              endColumnIndex: 2,
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 11,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 5, // Column F (0-based index)
              endColumnIndex: 10, // Column J (exclusive)
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 11,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: 0, // Assuming the first sheet
              startRowIndex: 3, // Row 4 (0-based index)
              endRowIndex: 4,
              startColumnIndex: 6, // Column F (0-based index)
              endColumnIndex: 20, // Column J (exclusive)
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: "LEFT",
                textFormat: {
                  fontSize: 11,
                },
              },
            },
            fields:
              "userEnteredFormat.horizontalAlignment, userEnteredFormat.textFormat.fontSize",
          },
        },
      ],
    };

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: formatRequest,
    });

    console.log(
      "Sheet formatted successfully with exact column sizes, row heights, and text styling!"
    );
  } catch (error) {
    console.error("❌ Error creating googlesheet:", error);
    throw error;
  }
  return rubric;
}

export async function updateRubricFromGoogleSheet(
  context: AppContext,
  rubric: Rubric
): Promise<Rubric> {
  const { GoogleServices } = context.appState;
  const { sheets } = GoogleServices;
  const spreadsheetId = rubric.googleSheetID;

  let response = null;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1", // Adjust if sheet name differs
    });
  } catch (error) {
    console.error("❌ Error updating rubric from Google Sheet:", error);
    throw error;
  }

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    throw new Error("No data found in the rubric sheet.");
  }

  // Extract title and grade level
  const title = rows[0][1] || "";
  const gradeLevel = parseInt(rows[1][1], 10) || 0;

  // Extract reflection data
  const includeReflection = rows[3][3]?.toUpperCase() === "TRUE";
  const askToExplainCopyPaste = rows[3][4]?.toUpperCase() === "TRUE";
  const reflectionQuestions = rows[3].slice(5).filter((q) => q);

  const reflection: Reflection = {
    enabled: includeReflection,
    copyPercentIncluded: askToExplainCopyPaste,
    question: reflectionQuestions,
    submittedAnswers: [],
    selectedQuestion: 0,
    placeholder: "",
    outOf: 1,
    currentScore: 0,
    noInputOnSubmit: false,
  };

  // Extract topics with student goals
  const topics: Topic[] = [];
  const topicsStartRow = 6; // Assuming topics start after row 6

  for (let i = topicsStartRow; i < rows.length; i++) {
    if (rows[i][0]) {
      topics.push({
        title: rows[i][0],
        description: rows[i][1] || "",
        outOf: rows[i][2] ? parseInt(rows[i][2], 10) : null,
        current: 0,
        studentGoalArray: [
          rows[i][3] || "", // Student Goal 1
          rows[i][4] || "", // Student Goal 2
          rows[i][5] || "", // Student Goal 3
        ],
      });
    }
  }

  rubric.title = title;
  rubric.gradeLevel = gradeLevel;
  rubric.reflection = reflection;
  rubric.googleSheetID = spreadsheetId;
  rubric.topics = topics;

  return rubric;
}

export async function getOrCreatePaperJournal(context: AppContext) {
  const { GoogleServices } = context.appState;
  if (!GoogleServices || !GoogleServices.docs) {
    throw new Error("GoogleServices is not initialized properly.");
  }
  const { drive } = GoogleServices;
  const { docs } = GoogleServices;
  const originalDocumentId = context.appState.documentId;
  const paperJournalId = context.documentMetaData.paperJournalId;
  if (paperJournalId) {
    return paperJournalId;
  } else {
    try {
      // 1) Create a new Google Doc, specifying multiple tabs in the request body.
      //    Each tab has its own title and content (body).
      const originalDocument = await docs.documents.get({
        documentId: originalDocumentId,
      });
      const createResponse = await docs.documents.create({
        requestBody: {
          title: `Writing Journal for ${originalDocument.data.title}`,
        },
      });

      // 2) The newly created document ID
      const newDocumentId = createResponse.data.documentId;

      await drive.files.update({
        fileId: newDocumentId,
        addParents: context.appState.levelUpFolderId,
        removeParents: "root",
        fields: "id, parents",
      });

      await drive.permissions.create({
        fileId: newDocumentId,
        requestBody: {
          role: "reader", // "reader" (view-only), "commenter", or "writer"
          type: "anyone", // Use "user" for specific email addresses
        },
      });

      // 6) Insert section headings: "Reflections" & "Challenges"
      const requests = [
        {
          insertText: {
            location: { index: 1 },
            text: "Reflections:\n", // Ensures "Reflections:" is its own paragraph
          },
        },
        {
          insertText: {
            location: { index: 14 }, // Insert "Challenges:" on a new line
            text: "Challenges:\n",
          },
        },

        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: 12 }, // "Reflections" text range
            paragraphStyle: { namedStyleType: "HEADING_1" },
            fields: "namedStyleType",
          },
        },
        {
          updateParagraphStyle: {
            range: { startIndex: 13, endIndex: 23 }, // "Challenges" text range
            paragraphStyle: { namedStyleType: "HEADING_1" },
            fields: "namedStyleType",
          },
        },
      ];

      // 7) Execute batch update request to insert headings
      await docs.documents.batchUpdate({
        documentId: newDocumentId,
        requestBody: { requests },
      });

      if (!newDocumentId) {
        throw new Error(
          "Failed to create a new multi-tab document (no documentId returned)."
        );
      }
      console.log("newDocumentId", newDocumentId);
      return newDocumentId; // Return or store in context, as needed
    } catch (error) {
      console.error("❌ Error creating paper journal with tabs:", error);
      throw error;
    }
  }
}
export async function addLevelToDocumentTitle(context: AppContext) {
  try {
    const { GoogleServices } = context.appState;
    if (!GoogleServices || !GoogleServices.docs) {
      throw new Error("GoogleServices is not initialized properly.");
    }

    const { docs } = GoogleServices;
    const documentId = context.appState.documentId;
    const level = context.uiState.level;

    // 1) Retrieve the document structure
    const docResponse = await docs.documents.get({
      documentId,
    });

    const bodyContent = docResponse.data.body?.content || [];
    let deleteStartIndex: number | null = null;
    let deleteEndIndex: number | null = null;

    // 2) Search for previous level title in the first paragraph
    if (bodyContent.length > 1 && bodyContent[1].paragraph?.elements) {
      const elements = bodyContent[1].paragraph.elements;

      let textContent = "";
      let startIndex = bodyContent[1].startIndex;
      let endIndex = startIndex;

      for (const element of elements) {
        if (element.textRun?.content) {
          textContent += element.textRun.content;
          endIndex += element.textRun.content.length;
        }
      }

      // Detect the old title format: "🏆Level X🏆"
      const levelTitleMatch = textContent.match(/🏆 Level \d+ 🏆.*/);

      if (levelTitleMatch) {
        deleteStartIndex = startIndex;
        deleteEndIndex =
          startIndex + levelTitleMatch.index! + levelTitleMatch[0].length + 2;
      }
    }

    const requests: any[] = [];

    // 3) If previous level title exists, delete it
    if (deleteStartIndex !== null && deleteEndIndex !== null) {
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: deleteStartIndex,
            endIndex: deleteEndIndex,
          },
        },
      });
    }

    // 4) Insert the new level title at the top
    const newLevelText = `🏆 Level ${level} 🏆    |    Writing Journal\n\n`;
    const writingJournalText = "Writing Journal"; // The part we want to hyperlink
    const separatorText = " | ";
    const writingJournalIndex = newLevelText.indexOf(writingJournalText);
    const separatorIndex = newLevelText.indexOf(separatorText);
    requests.push({
      insertText: {
        location: { index: 1 },
        text: newLevelText,
      },
    });

    // 5) Apply formatting (center, font color green, font Impact, size 16.5)
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: 1,
          endIndex: 1 + newLevelText.length,
        },
        textStyle: {
          foregroundColor: {
            color: {
              rgbColor: { red: 106 / 255, green: 168 / 255, blue: 79 / 255 },
            },
          },
          weightedFontFamily: {
            fontFamily: "Impact",
          },
          fontSize: {
            magnitude: 16.5,
            unit: "PT",
          },
        },
        fields: "foregroundColor,weightedFontFamily,fontSize",
      },
    });
    const writingJournalUrl = `https://docs.google.com/document/d/${context.documentMetaData.paperJournalId}`;
    console.log("writingJournalUrl", writingJournalUrl);
    // 5) Apply formatting for "Writing Journal" (Light blue, Arial, 12.5 pt, Hyperlink)
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: 1 + writingJournalIndex,
          endIndex: 1 + writingJournalIndex + writingJournalText.length,
        },
        textStyle: {
          link: { url: writingJournalUrl },
          foregroundColor: {
            color: {
              rgbColor: { red: 109 / 255, green: 158 / 255, blue: 235 / 255 },
            }, // Light blue
          },
          weightedFontFamily: { fontFamily: "Arial" },
          fontSize: { magnitude: 12.5, unit: "PT" },
          bold: true,
        },
        fields: "link,foregroundColor,weightedFontFamily,fontSize,bold",
      },
    });

    // 6) Apply formatting for "|" separator (Light gray)
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: 1 + separatorIndex,
          endIndex: 1 + separatorIndex + separatorText.length,
        },
        textStyle: {
          foregroundColor: {
            color: {
              rgbColor: { red: 153 / 255, green: 153 / 255, blue: 153 / 255 },
            }, // Light gray
          },
        },
        fields: "foregroundColor",
      },
    });

    // 6) Center align the level title
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: 1,
          endIndex: 1 + newLevelText.length,
        },
        paragraphStyle: {
          alignment: "CENTER",
        },
        fields: "alignment",
      },
    });

    // 7) Execute the batch update request
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests,
      },
    });

    console.log(
      "✅ Level title updated at the top, centered, green, Impact font, and size 16.5."
    );
  } catch (error) {
    console.error("❌ Error updating document level title:", error);
    throw error;
  }
}

export async function addEntryToWritingJournal(
  context: AppContext,
  title: string,
  entries: { definition: string; text: string }[],
  entryType: "reflection" | "challenge"
) {
  try {
    const { GoogleServices } = context.appState;
    if (!GoogleServices || !GoogleServices.docs) {
      throw new Error("GoogleServices is not initialized properly.");
    }

    const { docs } = GoogleServices;
    const journalDocumentId = context.documentMetaData.paperJournalId;

    if (!journalDocumentId) {
      throw new Error("Writing Journal document ID not found.");
    }

    // Retrieve the document contents
    const docResponse = await docs.documents.get({
      documentId: journalDocumentId,
    });

    const bodyContent = docResponse.data.body?.content || [];
    let insertIndex: number | null = null;

    // Define the section header to locate
    const sectionHeader =
      entryType === "reflection" ? "Reflections:" : "Challenges:";

    // Locate the section heading index
    for (const element of bodyContent) {
      if (element.paragraph?.elements) {
        const text = element.paragraph.elements
          .map((el) => el.textRun?.content)
          .join("")
          .trim();
        if (text === sectionHeader) {
          insertIndex = element.endIndex; // Insert right after the section title
          break;
        }
      }
    }

    if (insertIndex === null) {
      throw new Error(
        `Could not find the "${sectionHeader}" section in the journal.`
      );
    }

    const requests: any[] = [];

    // Insert Title (HEADING_3, bold, 0 spacing after)
    const formattedTitle = `${title}\n`;

    requests.push({
      insertText: {
        location: { index: insertIndex },
        text: formattedTitle,
      },
    });

    // Apply HEADING_3 style, bold, and 0 spacing after
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: insertIndex,
          endIndex: insertIndex + formattedTitle.length,
        },
        paragraphStyle: {
          namedStyleType: "HEADING_3",
          spaceBelow: { magnitude: 0, unit: "PT" }, // 0pt after
        },
        fields: "namedStyleType,spaceBelow",
      },
    });

    requests.push({
      updateTextStyle: {
        range: {
          startIndex: insertIndex,
          endIndex: insertIndex + formattedTitle.length,
        },
        textStyle: {
          bold: true,
        },
        fields: "bold",
      },
    });

    insertIndex += formattedTitle.length;

    // Insert each entry at the top (newest first)
    let isFirstEntry = true;
    for (const entry of entries) {
      const formattedDefinition = `${entry.definition}\n`;
      const formattedText = `${entry.text}\n`; // Start response with a TAB

      // Insert definition (bold, smaller font)
      requests.push({
        insertText: {
          location: { index: insertIndex },
          text: formattedDefinition,
        },
      });

      requests.push({
        updateTextStyle: {
          range: {
            startIndex: insertIndex,
            endIndex: insertIndex + entry.definition.length,
          },
          textStyle: {
            fontSize: { magnitude: 10, unit: "PT" }, // Smaller font size
            bold: true, // Make bold
          },
          fields: "fontSize,bold",
        },
      });

      // Set paragraph spacing for the definition
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: insertIndex,
            endIndex: insertIndex + entry.definition.length,
          },
          paragraphStyle: {
            spaceAbove: { magnitude: isFirstEntry ? 3 : 10, unit: "PT" }, // ✅ First entry = 3pt, others = 10pt
            spaceBelow: { magnitude: 3, unit: "PT" }, // 3pt after
          },
          fields: "spaceAbove,spaceBelow",
        },
      });

      insertIndex += entry.definition.length + 1;

      // Insert student response (regular text with a tab)
      requests.push({
        insertText: {
          location: { index: insertIndex },
          text: formattedText,
        },
      });

      // Explicitly set response text to "NORMAL_TEXT" to remove heading inheritance
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: insertIndex,
            endIndex: insertIndex + formattedText.length,
          },
          paragraphStyle: {
            namedStyleType: "NORMAL_TEXT",
            spaceAbove: { magnitude: 0, unit: "PT" }, // 0pt before
            spaceBelow: { magnitude: 0, unit: "PT" }, // 0pt after
            indentFirstLine: { magnitude: 36, unit: "PT" }, // ✅ Indent first line
            indentStart: { magnitude: 36, unit: "PT" }, // ✅ Indent all lines
          },
          fields:
            "namedStyleType,spaceAbove,spaceBelow,indentFirstLine,indentStart",
        },
      });

      insertIndex += entry.text.length + 1; // Account for tab and newlines
      isFirstEntry = false; // ✅ First entry logic applied
    }

    // Execute batch update request
    await docs.documents.batchUpdate({
      documentId: journalDocumentId,
      requestBody: { requests },
    });

    console.log(
      `✅ Added new ${entryType} entries under title "${title}" in the "${sectionHeader}" section.`
    );
  } catch (error) {
    console.error("❌ Error updating Writing Journal:", error);
    throw error;
  }
}
