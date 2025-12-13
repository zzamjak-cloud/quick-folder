import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
    copyPath: (path: string) => ipcRenderer.invoke('copy-path', path),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
