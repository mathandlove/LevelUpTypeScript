"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dataStore_1 = __importDefault(require("./dataStore"));
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json()); // Parse incoming JSON requests
// POST endpoint to store data
app.post("/store-data", (req, res) => {
    const { token, documentId } = req.body;
    if (!token || !documentId) {
        return res.status(400).send("Missing token or documentId");
    }
    dataStore_1.default.storeData(token, { documentId, lastUpdated: Date.now() });
    res.send("Data stored successfully!");
});
// GET endpoint to retrieve data
app.get("/get-data/:token", (req, res) => {
    const token = req.params.token;
    const data = dataStore_1.default.getData(token);
    if (!data) {
        return res.status(404).send("No data found for this token");
    }
    res.json(data);
});
// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
