import express, { Request, Response } from "express";
import cors from "cors";
import { initializeWebSocket } from "./websocket";
import { createServer } from "http";

const app = express();
const port = process.env.PORT || 8080; // Cloud Run uses port 8080

app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Origin"],
  })
);

// Create HTTP server from Express app
const server = createServer(app);

// Initialize WebSocket server
initializeWebSocket(server);

// Start the server
server.listen(port, () => {
  console.log(`🔥 WebSocket server running at http://localhost:${port}`);
});
