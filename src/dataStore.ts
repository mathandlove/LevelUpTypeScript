import { defaultUIState, UIState } from "./common/types";

// Define the structure of our stored data
interface DocumentData {
  documentId: string;
  lastUpdated: number;
  currentToken?: string;
  state: UIState;
}

// Main data store with double-key lookup
interface DataStore {
  [clientId: string]: {
    [documentId: string]: DocumentData;
  };
}

// Initialize the store
const store: DataStore = {};

// Helper functions to manage the store
const dataStore = {
  newDocumentData: (documentId: string, clientId: string): DocumentData => {
    if (!store[clientId]) {
      store[clientId] = {}; // Initialize the clientId object if it doesn't exist
    }
    return {
      documentId,
      lastUpdated: Date.now(),
      state: defaultUIState,
    };
  },
  storeData: (clientId: string, documentId: string, data: DocumentData) => {
    data.lastUpdated = Date.now();
    store[clientId][documentId] = data;
  },

  getData: (clientId: string, documentId: string): DocumentData => {
    if (!store[clientId] || !store[clientId][documentId]) {
      const data = dataStore.newDocumentData(documentId, clientId);
      store[clientId][documentId] = data;
    }
    return store[clientId][documentId];
  },

  getState: (clientId: string, documentId: string): UIState => {
    return dataStore.getData(clientId, documentId).state;
  },

  setState: (clientId: string, documentId: string, state: UIState) => {
    if (!store[clientId] || !store[clientId][documentId]) {
      const data = dataStore.newDocumentData(documentId, clientId);
      store[clientId][documentId] = data;
    }
    store[clientId][documentId].state = state;
  },
};

export default dataStore;
