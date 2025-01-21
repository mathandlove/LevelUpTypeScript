"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const websocket_1 = require("./websocket");
const http_1 = require("http");
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json()); // Parse incoming JSON requests
app.use((0, cors_1.default)({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "ngrok-skip-browser-warning",
        "Accept",
        "Origin",
    ],
}));
// Start the server
const server = (0, http_1.createServer)(app);
(0, websocket_1.initializeWebSocket)(server);
// Start the server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
