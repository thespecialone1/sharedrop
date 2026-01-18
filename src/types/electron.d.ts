export interface Session {
    id: string;
    folder_name: string;
    folder_path: string;
    password: string;
    status: 'active' | 'inactive';
    created_at: number;
    last_deployed_at: number | null;
    total_duration_ms: number;
    messageCount: number;
    usersInvolved: string[];
    isActive: boolean;
}

export interface ActiveSession {
    active: boolean;
    sessionId?: string;
    tunnelUrl?: string;
    password?: string;
    deployedAt?: number;
}

export interface FolderSelectResult {
    success: boolean;
    path?: string;
    name?: string;
}

export interface CreateSessionResult {
    success: boolean;
    session?: Session;
    existing?: boolean;
    error?: string;
}

export interface DeployResult {
    success: boolean;
    url?: string;
    password?: string;
    sessionId?: string;
    port?: number;
    error?: string;
}

export interface BrowseResult {
    success: boolean;
    items?: Array<{
        name: string;
        isDirectory: boolean;
        size: number | null;
        mtime: string;
    }>;
    path?: string;
    error?: string;
}

export interface IElectronAPI {
    // Session management
    getSessions: () => Promise<Session[]>;
    createSession: (folderPath: string, password?: string | null) => Promise<CreateSessionResult>;
    deploySession: (sessionId: string) => Promise<DeployResult>;
    stopSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    deleteSession: (sessionId: string) => Promise<{ success: boolean }>;
    wipeSessionChat: (sessionId: string) => Promise<{ success: boolean; deleted?: number }>;
    rotatePassword: (sessionId: string) => Promise<{ success: boolean; password?: string; error?: string }>;
    getActiveSession: () => Promise<ActiveSession>;

    // Folder operations
    selectFolder: () => Promise<FolderSelectResult>;
    browseFolder: (sessionId: string, relativePath?: string) => Promise<BrowseResult>;

    // Open in browser
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

    // App info
    getAppVersion: () => Promise<string>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}

export { };
