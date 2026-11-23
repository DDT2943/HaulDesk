import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let mainWindow = null;
let serverProcess = null;
let readyPort = null;
let isQuitting = false;

function resolveAppRoot() {
  return app.getAppPath();
}

function resolveIconPath() {
  const candidates = [
    path.join(resolveAppRoot(), 'build-resources', 'icon.png'),
    path.join(process.resourcesPath ?? '', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function buildApplicationMenu() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
}

function stopBackendServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  if (!proc.killed) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Ignore shutdown error
    }
  }
}

function startBackendServer() {
  return new Promise((resolve, reject) => {
    const appRoot = resolveAppRoot();
    const serverEntry = path.join(appRoot, 'dist', 'server.mjs');
    if (!fs.existsSync(serverEntry)) {
      reject(new Error(`Bundled server entry not found at ${serverEntry}`));
      return;
    }

    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    const child = spawn(process.execPath, [serverEntry], {
      cwd: appRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '0',
        DATA_DIR: dataDir,
        DISABLE_AI_ANALYSIS: process.env.DISABLE_AI_ANALYSIS ?? 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess = child;
    let settled = false;
    let stdoutBuf = '';
    let stderrBuf = '';

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`HaulDesk server startup timed out.\n${stderrBuf}`));
      }
    }, 15000);

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf-8');
      const match = stdoutBuf.match(/HAULDESK_READY_PORT=(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        readyPort = Number(match[1]);
        resolve(readyPort);
      }
    });

    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf-8');
    });

    child.once('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`HaulDesk server exited unexpectedly (code ${code ?? 'unknown'}).\n${stderrBuf}`));
      } else if (!isQuitting) {
        dialog.showErrorBox(
          'HaulDesk',
          'The local HaulDesk server stopped unexpectedly. Please restart the application.'
        );
        app.quit();
      }
    });
  });
}

function isAllowedRendererUrl(rawUrl, localOrigin) {
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return true;
  }
  try {
    return new URL(rawUrl).origin === localOrigin;
  } catch {
    return false;
  }
}

function createMainWindow(port) {
  const localOrigin = `http://127.0.0.1:${port}`;
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 920,
    minHeight: 620,
    title: 'HaulDesk',
    backgroundColor: '#F7F7F5',
    icon: resolveIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedRendererUrl(url, localOrigin)) {
      return { action: 'allow' };
    }
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedRendererUrl(targetUrl, localOrigin)) {
      return;
    }
    event.preventDefault();
    if (/^https?:\/\//i.test(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  void win.loadURL(localOrigin);
  mainWindow = win;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (readyPort !== null) {
      createMainWindow(readyPort);
    }
  });

  app.whenReady().then(async () => {
    buildApplicationMenu();
    try {
      const port = await startBackendServer();
      createMainWindow(port);
    } catch (err) {
      dialog.showErrorBox(
        'HaulDesk Startup Error',
        err instanceof Error ? err.message : String(err)
      );
      stopBackendServer();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && readyPort !== null) {
      createMainWindow(readyPort);
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopBackendServer();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
