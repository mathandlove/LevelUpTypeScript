const backendURL = "https://3f71-174-63-70-145.ngrok-free.app";
//don't forget white list

function openRubricDialog() {
  var html = HtmlService.createHtmlOutputFromFile("rubricEditor")
    .setWidth(400)
    .setHeight(100);
  DocumentApp.getUi().showModalDialog(html, "Edit Rubric");
}

function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu("🏆 Level Up")
    .addItem("Send Token to Server", "sendTokenToServer")
    .addItem("🏆 Level Up 🏆", "showSidebar")
    .addItem("Share Rubric", "openSharePopUp")
    .addToUi();
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
  DocumentApp.getUi().showModalDialog(html, "Share Your Rubric");
}

function oAuthGetter() {
  const ui = DocumentApp.getUi();
  const token = ScriptApp.getOAuthToken();
  ui.alert(token);
}

async function showSidebar() {
  const template = HtmlService.createTemplateFromFile("sidebar");
  //const topics= await stateManager.loadTopics()
  //template.topics = JSON.stringify(topics);

  const html = template.evaluate().setTitle("Level Up").setWidth(300);

  DocumentApp.getUi().showSidebar(html);
}

function sendTokenToServer(update = false) {
  const token = ScriptApp.getOAuthToken();
  const documentId = DocumentApp.getActiveDocument().getId();

  const payload = {
    token: token,
    documentId: documentId,
  };
  console.log(payload);
  try {
    var response = "";
    if (!update) {
      response = sendToBackend("/store-token", payload);
    } else {
      response = sendToBackend("/update-token", payload);
    }
    Logger.log(response);
    return response;
  } catch (error) {
    Logger.log("Error storing token:", error);
    throw error;
  }
}

// Function to update token on the server
function updateTokenForServer() {
  var newToken = ScriptApp.getOAuthToken();

  if (!cachedToken) {
    cachedToken = newToken; // Initialize on first call
    return;
  }

  var url = "https://your-backend-url.com/update-token";

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ oldToken: cachedToken, newToken: newToken }),
  };

  // Send the tokens to the server
  UrlFetchApp.fetch(url, options);

  // Update cachedToken to the new token
  cachedToken = newToken;
}

function updateTokenData() {
  var newToken = ScriptApp.getOAuthToken();
  const documentId = DocumentApp.getActiveDocument().getId();
  return { token: newToken, documentId: documentId, clientId: "" };
}

function getDocumentAndClientInfo() {
  // Get the active document's ID

  const clientId = Session.getActiveUser().getEmail();

  return {
    documentId: documentId,
    clientId: clientId,
  };
}

function sendToBackend(endpoint, payload) {
  const serverUrl = backendURL;
  const url = serverUrl + endpoint;
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    return response.getContentText();
  } catch (e) {
    Logger.log("Error:", e.message);
    throw e;
  }
}
