"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultUIState = void 0;
exports.isTokenData = isTokenData;
// Then define any constants
exports.defaultUIState = {
    currentPage: "home-page",
    waitingAnimationOn: false,
    visibleButtons: ["next-button"],
    buttonsDisabled: [],
    level: 0,
    pills: [],
    copypasted: 0,
    timeSpentHours: 0,
    timeSpentMinutes: 0,
};
// Finally, define any functions that use the types
function isTokenData(message) {
    return (message &&
        typeof message.clientId === "string" &&
        typeof message.documentId === "string" &&
        typeof message.token === "string");
}
