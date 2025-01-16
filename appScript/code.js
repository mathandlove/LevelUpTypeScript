const backendURL = "https://47e6-174-63-70-145.ngrok-free.app";
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu("🏆 Level Up")
    .addItem("Send Token to Server", "sendTokenToServer")
    .addItem("Live the Sidebar", "showSidebar")
    .addToUi();
}

async function showSidebar() {
  const template = HtmlService.createTemplateFromFile("sidebar");
  //const topics= await stateManager.loadTopics()
  //template.topics = JSON.stringify(topics);

  const html = template.evaluate().setTitle("Level Up").setWidth(300);

  DocumentApp.getUi().showSidebar(html);
}

function sendTokenToServer(update = true) {
  const token = ScriptApp.getOAuthToken();
  const documentId = DocumentApp.getActiveDocument().getId();

  const payload = {
    token: token,
    documentId: documentId,
  };

  try {
    const response = "";
    if (update) {
      response = sendToBackend("/store-token", payload);
    } else {
      response = sendToBackend("/update-token", payload);
    }
    Logger.log("Token stored successfully:", response);
    return response;
  } catch (error) {
    Logger.log("Error storing token:", error);
    throw error;
  }
}

// Function to update token on the server
function updateToken() {
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
