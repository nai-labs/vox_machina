import { useState, useEffect, useCallback } from 'react';

const DB_NAME = 'vox_machina_sessions';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

/**
 * useSessionHistory - IndexedDB-backed session history storage
 * Stores session metadata and audio blobs for replay
 */
export function useSessionHistory() {
    const [sessions, setSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [db, setDb] = useState(null);

    // Initialize IndexedDB
    useEffect(() => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('[SessionHistory] IndexedDB error:', event.target.error);
            setIsLoading(false);
        };

        request.onsuccess = (event) => {
            const database = event.target.result;
            setDb(database);
            loadSessions(database);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Create sessions store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('characterId', 'characterId', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('[SessionHistory] Created sessions store');
            }
        };

        return () => {
            if (db) {
                db.close();
            }
        };
    }, []);

    // Load all sessions from IndexedDB
    const loadSessions = useCallback((database) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by timestamp descending (newest first)
            const sortedSessions = request.result.sort((a, b) => b.timestamp - a.timestamp);
            setSessions(sortedSessions);
            setIsLoading(false);
            console.log(`[SessionHistory] Loaded ${sortedSessions.length} sessions`);
        };

        request.onerror = (event) => {
            console.error('[SessionHistory] Failed to load sessions:', event.target.error);
            setIsLoading(false);
        };
    }, []);

    // Save a new session
    const saveSession = useCallback(async (sessionData) => {
        if (!db) {
            console.error('[SessionHistory] Database not initialized');
            return null;
        }

        const session = {
            ...sessionData,
            timestamp: Date.now(),
            displayName: generateDisplayName(sessionData.characterName, sessionData.timestamp || Date.now())
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(session);

            request.onsuccess = () => {
                console.log(`[SessionHistory] Saved session: ${session.displayName}`);
                loadSessions(db); // Refresh the list
                resolve(request.result); // Returns the new ID
            };

            request.onerror = (event) => {
                console.error('[SessionHistory] Failed to save session:', event.target.error);
                reject(event.target.error);
            };
        });
    }, [db, loadSessions]);

    // Delete a session
    const deleteSession = useCallback(async (sessionId) => {
        if (!db) return;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(sessionId);

            request.onsuccess = () => {
                console.log(`[SessionHistory] Deleted session ${sessionId}`);
                loadSessions(db);
                resolve();
            };

            request.onerror = (event) => {
                console.error('[SessionHistory] Failed to delete session:', event.target.error);
                reject(event.target.error);
            };
        });
    }, [db, loadSessions]);

    // Get a single session by ID
    const getSession = useCallback(async (sessionId) => {
        if (!db) return null;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(sessionId);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }, [db]);

    // Clear all sessions
    const clearAllSessions = useCallback(async () => {
        if (!db) return;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('[SessionHistory] Cleared all sessions');
                setSessions([]);
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }, [db]);

    return {
        sessions,
        isLoading,
        saveSession,
        deleteSession,
        getSession,
        clearAllSessions,
        refreshSessions: () => db && loadSessions(db)
    };
}

// Generate a human-readable session name
function generateDisplayName(characterName, timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateStr;
    if (date.toDateString() === today.toDateString()) {
        dateStr = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        dateStr = 'Yesterday';
    } else {
        dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return `${characterName} - ${dateStr} ${timeStr}`;
}

// Format duration in mm:ss or hh:mm:ss
export function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
