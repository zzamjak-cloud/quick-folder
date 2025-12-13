import { app, BrowserWindow, ipcMain, shell, clipboard, dialog } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let win: BrowserWindow | null = null

  async function createWindow() {
    win = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Disable sandbox to ensure preload works
      },
    })

    if (process.env.VITE_DEV_SERVER_URL) {
      await win.loadURL(process.env.VITE_DEV_SERVER_URL)
      win.webContents.openDevTools()
    } else {
      const indexHtml = join(distPath, 'index.html')
      // Try to load file, with error logging
      try {
        await win.loadFile(indexHtml)
      } catch (e) {
        console.error('Failed to load index.html:', e)
      }
      // Open DevTools in production for debugging
      // win.webContents.openDevTools()
    }
  }

  // Set DIST path safely
  const distPath = join(__dirname, '../dist')
  if (!process.env.VITE_DEV_SERVER_URL) {
    // In production, verify path exists (optional debug)
    console.log('Loading from:', distPath)
  }

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })

    // IPC Handlers
    ipcMain.handle('open-folder', async (_event, path: string) => {
      try {
        const result = await shell.openPath(path)
        return { success: !result, error: result } // shell.openPath returns error string or empty string on success
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    ipcMain.handle('copy-path', async (_event, path: string) => {
      try {
        clipboard.writeText(path)
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })
    ipcMain.handle('select-folder', async () => {
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }
      const path = result.filePaths[0]
      const name = path.split(process.platform === 'win32' ? '\\' : '/').pop()
      return { canceled: false, path, name }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}
