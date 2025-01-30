import { ChallengeInfo } from "../common/types";
import { AppContext } from "../stateMachine";

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
    context.documentMetaData.challengeArray[
      context.documentMetaData.selectedChallengeNumber
    ][0].sentenceStartIndex + 1; // +1 because the index is 0 based
  const endIndex =
    context.documentMetaData.challengeArray[
      context.documentMetaData.selectedChallengeNumber
    ][0].sentenceEndIndex + 1; // +1 because the index is 0 based

  const docEndIndex = doc.data.body.content.reduce((acc, element) => {
    if (element.endIndex) {
      return Math.max(acc, element.endIndex);
    }
    return acc;
  }, 0);

  // BatchUpdate request to highlight text

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
export async function createGoogleSheet(context: AppContext) {
  const { GoogleServices } = context.appState;
  const { sheets, drive } = GoogleServices;

  // Step 1: Create a new Google Sheet
  /*
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: "Level Up Template",
      },
    },
  });
    const spreadsheetId = response.data.spreadsheetId;
  */
  const spreadsheetId = "1wywByFIX6LYYB0MK958a3iXKpIXObSWa4l3R8npyPeE";
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  console.log(`Spreadsheet created: ${spreadsheetUrl}`);

  // Step 2: Set permissions to allow access
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: {
      role: "writer", // Change to 'reader' for view-only access
      type: "anyone", // Change to 'user' and provide an email for specific access
    },
  });
  console.log("Permissions updated: Anyone with the link can edit.");

  // Step 3: Populate the sheet with data
  const values = [
    ["Rubric Title: ", "Add Rubric Name Here"],
    ["Grade Level: ", "6"],
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
      "What went well?",
      "What was difficult?",
      "How can your teacher help you?",
      "",
      "",
    ],
    [
      "Organization",
      "There is a clear introduction, body, and conclusion. Paragraphs start by introducing the main idea.",
      "5",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "Evidence",
      "Strong evidence is provided to support paragraph main ideas. Analysis is provided for evidence.",
      "5",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "Word Choice",
      "Paragraphs start with main ideas and other sentences support the main idea",
      "5",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "Grammar",
      "Sentences are free of grammatical and punctuation errors.",
      "5",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1:K8",
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
            startRowIndex: 4, // Row 5 (0-based index)
            startColumnIndex: 0, // Column C (0-based index)
            endColumnIndex: 3,
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
          properties: { pixelSize: 480 },
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
          properties: { pixelSize: 150 },
          fields: "pixelSize",
        },
      },

      // Row heights
      {
        updateDimensionProperties: {
          range: { sheetId: 0, dimension: "ROWS", startIndex: 0, endIndex: 3 },
          properties: { pixelSize: 78 },
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
      {
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
                    boolValue: false, // Default unchecked, set to true for checked
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
                    boolValue: false, // Default unchecked, set to true for checked
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
              backgroundColor: {
                red: 44 / 255,
                green: 82 / 255,
                blue: 115 / 255,
              },
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
          fields: "userEnteredFormat(backgroundColor, textFormat)",
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
              textFormat: {
                fontSize: 11,
              },
            },
          },
          fields: "userEnteredFormat.textFormat.fontSize",
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
  return spreadsheetUrl;
}
