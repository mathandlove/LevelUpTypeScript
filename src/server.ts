/*
import express, { Request, Response } from "express";
import dataStore from "./dataStore";
import cors from "cors";
import { initializeWebSocket } from "./websocket";
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

// Define the shape of the expected request body

app.get("/test", (req: Request, res: Response) => {
  res.json({ message: "Server is running!" });
});

// POST endpoint to store data
interface StoreTokenRequestBody {
  token: string;
  documentId: string;
}

// GET endpoint becomes a POST endpoint
app.post("/get-data", (req: Request, res: Response) => {
  const { clientId, documentId } = req.body;

  if (!clientId || !documentId) {
    return res.status(400).send("Missing clientId or documentId");
  }

  const state = dataStore.getState(clientId, documentId);
  console.log("Retrieved data:", state);
  console.log(clientId);

  if (!state) {
    return res
      .status(404)
      .send("No data found for this client/document combination");
  }

  return res.json(state.ui);
});

// Start the server

const server = createServer(app);
initializeWebSocket(server);

// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
*/
