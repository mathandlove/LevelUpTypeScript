"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkError = exports.AuthError = void 0;
exports.getClientId = getClientId;
const node_fetch_1 = __importDefault(require("node-fetch"));
//Error Messages
// Define custom error classes
class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = "AuthError";
    }
}
exports.AuthError = AuthError;
class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = "NetworkError";
    }
}
exports.NetworkError = NetworkError;
async function getClientId(tokenString) {
    try {
        const requestBody = JSON.stringify({ access_token: tokenString });
        const response = await (0, node_fetch_1.default)("https://www.googleapis.com/oauth2/v1/tokeninfo", {
            method: "POST",
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
            },
        });
        const responseText = await response.text();
        const responseData = JSON.parse(responseText);
        if (responseData.error) {
            throw new AuthError(responseData.error_description || responseData.error);
        }
        if (!response.ok) {
            throw new AuthError("Authentication failed");
        }
        if (!responseData.audience) {
            throw new AuthError("Invalid token response");
        }
        return responseData.audience;
    }
    catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }
        throw new AuthError("Unexpected Authentication failed");
    }
}
