import { ChallengeInfo, Reflection, Rubric } from "../common/types";
import { AppContext } from "../common/appTypes.js";

export async function getFullText(context: AppContext): Promise<string> {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;
  const response = await docs.documents.get({
    documentId: context.appState.documentId,
  });

  const body = response.data.body?.content;

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

  return text;
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
    console.error("❌ Error updating rubric from googlesheet:", error);
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

  // Extract topics
  const topics = [];
  for (let i = 4; i < rows.length; i++) {
    if (rows[i][0]) {
      // Ensure it's a valid topic row
      topics.push({
        title: rows[i][0],
        description: rows[i][1] || "",
        outOf: rows[i][2] ? parseInt(rows[i][2], 10) : null,
        current: 0,
      });
    }
  }

  rubric.title = title;
  rubric.gradeLevel = gradeLevel;
  rubric.topics = topics;
  rubric.reflection = reflection;
  rubric.googleSheetID = spreadsheetId;
  rubric.topics = topics;

  return rubric;
}
