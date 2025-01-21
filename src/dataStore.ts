/*
import 

// No longer need separate DocumentData interface since State contains everything
interface DataStore {
  [clientId: string]: {
    [documentId: string]: {
      lastUpdated: number;
      state: UIstate;
    };
  };
}

const store: DataStore = {};

const dataStore = {
  newState: (clientId: string, documentId: string): State => {
    if (!store[clientId]) {
      store[clientId] = {};
    }

    const newState = createNewState(); // From stateMachine
    newState.app.clientId = clientId; // Store clientId
    newState.app.documentId = documentId; // Store documentId

    store[clientId][documentId] = {
      lastUpdated: Date.now(),
      state: newState,
    };

    return newState;
  },

  storeState: (clientId: string, documentId: string, state: State) => {
    if (!store[clientId]) {
      store[clientId] = {};
    }

    store[clientId][documentId] = {
      lastUpdated: Date.now(),
      state: state,
    };
  },

  getState: (clientId: string, documentId: string): State => {
    if (!store[clientId] || !store[clientId][documentId]) {
      return dataStore.newState(clientId, documentId);
    }
    return store[clientId][documentId].state;
  },
};

export default dataStore;
*/
