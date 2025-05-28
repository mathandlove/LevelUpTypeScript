function onInstall(e) {
  onOpen(e);
}

function openRubricDialog() {
  var html = HtmlService.createHtmlOutputFromFile("rubricEditor")
    .setWidth(400)
    .setHeight(100);
  DocumentApp.getUi().showModalDialog(html, "Edit Rubric");
}

function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu("Level Up")
    .addItem("🏆 New Session 🏆", "showSidebar")
    .addItem("GetToken", "updateTokenData")
    .addItem("Pop Up", "openSharePopUp")
    .addItem("Move Cursor", "moveCursorToCharacterIndex")
    .addToUi();
}

async function showSidebar() {
  const template = HtmlService.createTemplateFromFile("sidebar");
  const token = ScriptApp.getOAuthToken(); // Fetch the token
  const doc = DocumentApp.getActiveDocument();
  template.documentId = doc.getId();
  template.token = token; // Pass the token to the sidebar
  const html = template.evaluate().setTitle("Level Up").setWidth(300);
  const uid = DocumentApp.getUi();
  PropertiesService.getScriptProperties().setProperty("UID", uid);
  DocumentApp.getUi().showSidebar(html);
}

function openSharePopUp(
  sRubricId = "LVL-2345",
  sRubricTitle = "Test Rubric",
  sWebpageLink = "http://www.wonder.io"
) {
  var template = HtmlService.createTemplateFromFile("sharePopUp");

  // Assign the values to the template
  template.sRubricId = sRubricId;
  template.sRubricTitle = sRubricTitle;
  template.sWebpageLink = sWebpageLink;

  var html = template.evaluate().setWidth(400).setHeight(350);
  const doc = DocumentApp.getActiveDocument();
  if (!doc) {
    Logger.log(
      "No active doc recognized. Possibly not running in doc context or insufficient permissions."
    );
    return;
  }
  const uid =
    PropertiesService.getScriptProperties().getProperty("ACTIVE_DOC_ID");
  uid.showModalDialog(html, "Share Your Rubric");
}

function updateTokenData() {
  var newToken = ScriptApp.getOAuthToken();
  console.log(newToken);
  const documentId = DocumentApp.getActiveDocument().getId(); //todo i won't be able to call this from server side i believe.
  return { token: newToken, documentId: documentId, clientId: "" };
}
function getActiveDocument() {
  DocumentApp.getActiveDocument();
}

function logSelectedDocument(docId) {
  Logger.log("Selected Document ID: " + docId);
}

function moveCursorToCharacterIndex(targetCharIndex = 2) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  let charCount = 0;

  for (let i = 0; i < body.getNumChildren(); i++) {
    const element = body.getChild(i);

    if (element.getType() === DocumentApp.ElementType.PARAGRAPH) {
      const textElement = element.asParagraph().editAsText();
      const text = textElement.getText();
      const textLength = text.length;

      if (charCount + textLength >= targetCharIndex) {
        const offset = targetCharIndex - charCount;
        const position = doc.newPosition(textElement, offset);
        doc.setCursor(position);
        return;
      }

      charCount += textLength;
    }
  }

  Logger.log("Character index out of bounds.");
}
