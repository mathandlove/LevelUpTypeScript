import dataStore from "../dataStore";
import fs from "fs";
import path from "path";

interface TokenInfo {
  audience: string; // clientId
  email?: string;
  expires_in?: number;
  // ... other fields from Google's response
}

interface TokenData {
  clientId: string;
  documentId: string;
}

const DATA_FILE = path.join(__dirname, "../../public/tokenData.json");

export async function verifyGoogleToken(token: string): Promise<TokenInfo> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v1/tokeninfo",
    {
      method: "POST",
      body: JSON.stringify({ access_token: token }),
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error("Invalid token");
  }

  return response.json();
}

export async function storeToken(
  token: string,
  documentId: string
): Promise<string> {
  try {
    // Verify token with Google and get clientId
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo",
      {
        method: "POST",
        body: JSON.stringify({ access_token: token }),
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error("Invalid token");
    }

    const tokenInfo = await response.json();
    const clientId = tokenInfo.audience;

    // Store in dataStore
    dataStore.storeData(clientId, documentId, {
      documentId,
      lastUpdated: Date.now(),
      currentToken: token,
    });

    // Save to file for quick access
    const tokenData: TokenData = {
      clientId,
      documentId,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(tokenData, null, 2));
    console.log(clientId);
    return "Token stored successfully!";
  } catch (error) {
    console.error("Error storing token:", error);
    throw error;
  }
}
