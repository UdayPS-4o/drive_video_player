const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const os = require('os')

let mainWindow

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#07070a',
    autoHideMenuBar: true,
    title: 'Aurora',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  // Avoid the white flash — reveal only once the renderer has painted.
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // External links open in the system browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(DEV_URL)
}

app.whenReady().then(() => {
  createWindow()

  // Native window handle — used to embed the MPV surface inside this window.
  ipcMain.handle('get-window-handle', () => {
    try {
      const buf = mainWindow.getNativeWindowHandle()
      return os.endianness() === 'LE' ? buf.readInt32LE(0) : buf.readInt32BE(0)
    } catch (e) {
      console.error(e)
      return null
    }
  })

  // Optional window controls (available if the UI wants a custom title bar).
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
