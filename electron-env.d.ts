export interface IElectronAPI {
    openFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
    copyPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    selectFolder: () => Promise<{ canceled: boolean; path?: string; name?: string }>;
    getPathForFile: (file: File) => string;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
