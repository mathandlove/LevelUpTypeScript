"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dataStore = {};
exports.default = {
    storeData: (token, data) => {
        dataStore[token] = data;
        console.log(`Data stored for token: ${token}`);
    },
    getData: (token) => {
        return dataStore[token] || null;
    },
};
