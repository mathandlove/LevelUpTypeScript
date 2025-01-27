function isValidBasePayload(payload) {
    return (payload &&
        typeof payload.clientId === "string" &&
        typeof payload.documentId === "string");
}
export function isValidTokenIncomingMessage(message) {
    return (message &&
        message.type === "GIVE_TOKEN" &&
        isValidBasePayload(message.payload) &&
        typeof message.payload.token === "string");
}
export function isValidButtonClickedIncomingMessage(message) {
    return (message &&
        message.type === "BUTTON_CLICKED" &&
        isValidBasePayload(message.payload) &&
        typeof message.payload.buttonId === "string");
}
export function isValidIncomingWebSocketMessage(message) {
    if (!message || typeof message !== "object")
        return false;
    switch (message.type) {
        case "GIVE_TOKEN":
            return (message.payload &&
                typeof message.payload.token === "string" &&
                typeof message.payload.clientId === "string" &&
                typeof message.payload.documentId === "string");
        case "BUTTON_CLICKED":
            return (message.payload &&
                typeof message.payload.buttonId === "string" &&
                typeof message.payload.clientId === "string" &&
                typeof message.payload.documentId === "string" &&
                (message.payload.buttonTitle === undefined ||
                    typeof message.payload.buttonTitle === "number"));
    }
}
//# sourceMappingURL=wsTypes.js.map