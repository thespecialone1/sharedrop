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
    getServerPort: () => Promise<{ success: boolean; port?: number; error?: string }>;
    onAlbumUpdate: (callback: () => void) => () => void;

    // Session Control (Owner)
    onSessionMembersUpdate: (callback: (data: {
        roomId: string; members: Array<{
            username: string;
            canonicalUsername: string;
            color: string;
            joinedAt: string;
            socketId: string;
        }>
    }) => void) => void;
    kickUser: (sessionId: string, socketId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
    banUser: (sessionId: string, canonicalUsername: string, reason?: string, scope?: 'session' | 'global') => Promise<{ success: boolean; error?: string }>;
    unbanUser: (sessionId: string, canonicalUsername: string, scope?: 'session' | 'global') => Promise<{ success: boolean; error?: string }>;
    getBannedUsers: (sessionId: string) => Promise<{ success: boolean; bans?: { session: string[]; tempKicked: string[]; global: any[] }; error?: string }>;

    // Album management
    getAlbums: (sessionId: string) => Promise<{ success: boolean; albums?: Album[]; error?: string }>;
    createAlbum: (sessionId: string, name: string, type: string) => Promise<{ success: boolean; album?: Album; error?: string }>;
    approveAlbum: (sessionId: string, albumId: string) => Promise<{ success: boolean; album?: Album; error?: string }>;
    lockAlbum: (sessionId: string, albumId: string, locked: boolean) => Promise<{ success: boolean; album?: Album; error?: string }>;
    deleteAlbum: (sessionId: string, albumId: string) => Promise<{ success: boolean; error?: string }>;
    addAlbumItem: (sessionId: string, albumId: string, filePath: string, metadata?: { favorite?: boolean; note?: string; coverRole?: string }) => Promise<{ success: boolean; item?: AlbumItem; error?: string }>;
    removeAlbumItem: (sessionId: string, itemId: string) => Promise<{ success: boolean; error?: string }>;
    updateAlbumItem: (sessionId: string, itemId: string, updates: { favorite?: boolean; note?: string; coverRole?: string }) => Promise<{ success: boolean; item?: AlbumItem; error?: string }>;
    exportAlbums: (sessionId: string) => Promise<{ success: boolean; data?: AlbumExport; error?: string }>;

    // Recovery
    checkRecovery: (folderPath: string) => Promise<{ hasRecovery: boolean; data?: any }>;
    resumeCollaboration: (folderPath: string, newSessionId: string) => Promise<{ success: boolean; migrated?: any; error?: string }>;
    startFresh: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
}

export interface Album {
    id: string;
    name: string;
    type: string | null;
    status: string;
    locked: number;
    created_by: string;
    created_at: number;
    approved_by: string | null;
    items?: AlbumItem[];
}

export interface AlbumItem {
    id: string;
    album_id: string;
    file_path: string;
    favorite: number;
    note: string;
    cover_role: string;
    added_by: string;
    added_at: number;
}

export interface AlbumExport {
    sessionId: string;
    folderPath: string;
    exportedAt: number;
    albums: Array<{
        id: string;
        name: string;
        type: string | null;
        status: string;
        locked: boolean;
        createdBy: string;
        createdAt: number;
        approvedBy: string | null;
        items: Array<{
            path: string;
            favorite: boolean;
            note: string;
            coverRole: string;
            addedBy: string;
            addedAt: number;
        }>;
    }>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}

export { };
