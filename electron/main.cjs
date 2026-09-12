const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

const PLAYER_URL = process.env.NVRPLLST_URL || "http://91.108.239.4:58595/";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow;
let updateTimer;
let updateState = {
  status: "idle",
  currentVersion: app.getVersion()
};

function publicUpdateState() {
  return { ...updateState };
}

function setUpdateState(nextState) {
  updateState = { ...updateState, ...nextState };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nvrpllst:update-state", publicUpdateState());
  }
}

function errorMessage(error) {
  if (!error) return "Unable to check for updates.";
  return String(error.message || error).split("\n")[0].slice(0, 240);
}

async function checkForUpdates({ userInitiated = false } = {}) {
  if (!app.isPackaged || process.platform !== "win32") {
    if (userInitiated) {
      setUpdateState({ status: "development", message: "Updates are available in installed Windows builds." });
    }
    return null;
  }

  setUpdateState({ status: "checking", userInitiated, message: undefined });
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateState({ status: "error", message: errorMessage(error), userInitiated });
    return null;
  }
}

function configureUpdates() {
  if (!app.isPackaged || process.platform !== "win32") return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking", message: undefined });
  });
  autoUpdater.on("update-available", (info) => {
    setUpdateState({ status: "available", availableVersion: info.version, percent: 0 });
  });
  autoUpdater.on("update-not-available", () => {
    setUpdateState({
      status: "current",
      availableVersion: undefined,
      percent: undefined,
      userInitiated: false
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({
      status: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0)))
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState({ status: "downloaded", availableVersion: info.version, percent: 100 });
  });
  autoUpdater.on("error", (error) => {
    setUpdateState({
      status: "error",
      message: errorMessage(error),
      userInitiated: Boolean(updateState.userInitiated || updateState.status === "downloading")
    });
  });

  const startupCheck = setTimeout(() => void checkForUpdates(), 5000);
  startupCheck.unref();
  updateTimer = setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000);
  updateTimer.unref();
}

function isPlayerURL(value) {
  try {
    return new URL(value).origin === new URL(PLAYER_URL).origin;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "NvrPllst",
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isPlayerURL(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isPlayerURL(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  mainWindow.loadURL(PLAYER_URL);
}

ipcMain.handle("nvrpllst:update-get-state", () => publicUpdateState());
ipcMain.handle("nvrpllst:update-check", () => checkForUpdates({ userInitiated: true }));
ipcMain.handle("nvrpllst:update-download", async () => {
  if (updateState.status !== "available") return publicUpdateState();
  setUpdateState({ status: "downloading", percent: 0, userInitiated: true });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setUpdateState({ status: "error", message: errorMessage(error), userInitiated: true });
  }
  return publicUpdateState();
});
ipcMain.on("nvrpllst:update-install", () => {
  if (updateState.status === "downloaded") autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(() => {
  createWindow();
  configureUpdates();
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (updateTimer) clearInterval(updateTimer);
  app.quit();
});
