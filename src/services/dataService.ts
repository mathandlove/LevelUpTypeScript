import dataStore from "../dataStore";
import fs from "fs";
import path from "path";
import { TokenData } from "../../src/common/types";
interface TokenInfo {
  audience: string; // clientId
  email?: string;
  expires_in?: number;
  // ... other fields from Google's response
}

const DATA_FILE = path.join(__dirname, "../../public/tokenData.json");

export async function getClientId(tokenString: string): Promise<string> {
  try {
    // Verify token with Google and get clientId
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo",
      {
        method: "POST",
        body: JSON.stringify({ access_token: tokenString }),
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error("Invalid token");
    }

    const tokenInfo = await response.json();
    const clientId = tokenInfo.audience;

    return clientId;
  } catch (error) {
    console.error("Error storing token:", error);
    throw error;
  }
}
