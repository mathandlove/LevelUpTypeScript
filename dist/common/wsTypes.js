"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidTokenIncomingMessage = isValidTokenIncomingMessage;
exports.isValidButtonClickedIncomingMessage = isValidButtonClickedIncomingMessage;
exports.isValidIncomingWebSocketMessage = isValidIncomingWebSocketMessage;
function isValidBasePayload(payload) {
    return (payload &&
        typeof payload.clientId === "string" &&
        typeof payload.documentId === "string");
}
function isValidTokenIncomingMessage(message) {
    return (message &&
        message.type === "RECEIVE_TOKEN" &&
        isValidBasePayload(message.payload) &&
        typeof message.payload.token === "string");
}
function isValidButtonClickedIncomingMessage(message) {
    return (message &&
        message.type === "BUTTON_CLICKED" &&
        isValidBasePayload(message.payload) &&
        typeof message.payload.buttonId === "string");
}
function isValidIncomingWebSocketMessage(message) {
    return (isValidTokenIncomingMessage(message) ||
        isValidButtonClickedIncomingMessage(message));
}
