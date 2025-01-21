import express, { Request, Response } from "express";
import cors from "cors";
import { initializeWebSocket } from "./websocket.js";
import { createServer } from "http";

const app = express();
const port = 3000;

app.use(express.json()); // Parse incoming JSON requests
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "ngrok-skip-browser-warning",
      "Accept",
      "Origin",
    ],
  })
);

// Start the server

const server = createServer(app);
initializeWebSocket(server);

// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
