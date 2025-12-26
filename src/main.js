const { app, BrowserWindow, globalShortcut, ipcMain, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
const userHome = os.homedir();
const powerToysPath = path.join(userHome, 'Documents', 'BetterShorts');
const appDataPath = app.getPath('userData');
const shortcutsFile = path.join(appDataPath, 'shortcuts.json');
const settingsFile = path.join(appDataPath, 'settings.json');

function checkInstallation() {
  if (!fs.existsSync(powerToysPath)) {
    try {
      fs.mkdirSync(powerToysPath, { recursive: true });
      
      if (Notification.isSupported()) {
        new Notification({
          title: 'BetterShorts - Première installation',
          body: `Le dossier BetterShorts a été créé dans : ${powerToysPath}`,
          icon: path.join(__dirname, 'icon.png')
        }).show();
      }
      
      console.log('Dossier BetterShorts créé:', powerToysPath);
    } catch (error) {
      console.error('Erreur création dossier:', error);
      
      if (Notification.isSupported()) {
        new Notification({
          title: 'BetterShorts - Erreur d\'installation',
          body: 'Impossible de créer le dossier PowerToys. Vérifiez les permissions.',
        }).show();
      }
    }
  } else {
    console.log('BetterShorts installé dans:', powerToysPath);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erreur chargement paramètres:', error);
  }
  return {
    autoStart: false,
    version: '1.0.0',
    lastCheck: null
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Erreur sauvegarde paramètres:', error);
  }
}

function loadShortcuts() {
  try {
    if (fs.existsSync(shortcutsFile)) {
      return JSON.parse(fs.readFileSync(shortcutsFile, 'utf8'));
    }
  } catch (error) {
    console.error('Erreur chargement raccourcis:', error);
  }
  return [];
}

function saveShortcuts(shortcuts) {
  try {
    fs.writeFileSync(shortcutsFile, JSON.stringify(shortcuts, null, 2));
  } catch (error) {
    console.error('Erreur sauvegarde raccourcis:', error);
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const shortcuts = loadShortcuts();
  
  shortcuts.forEach(shortcut => {
    if (shortcut.enabled) {
      try {
        globalShortcut.register(shortcut.keys, () => {
          executeShortcut(shortcut);
        });
      } catch (error) {
        console.error(`Erreur enregistrement ${shortcut.keys}:`, error);
      }
    }
  });
}

function executeShortcut(shortcut) {
  if (shortcut.type === 'app') {
    shell.openPath(shortcut.target);
  } else if (shortcut.type === 'url') {
    shell.openExternal(shortcut.target);
  } else if (shortcut.type === 'code') {
    try {
      eval(shortcut.target);
    } catch (error) {
      console.error('Erreur exécution code:', error);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    frame: false,
    backgroundColor: '#202020',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  registerShortcuts();
}

app.whenReady().then(() => {
  checkInstallation();
  createWindow();
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-shortcuts', () => loadShortcuts());

ipcMain.handle('save-shortcuts', (event, shortcuts) => {
  saveShortcuts(shortcuts);
  registerShortcuts();
  return true;
});

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings);
  return true;
});

ipcMain.handle('export-shortcuts', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter les raccourcis',
    defaultPath: path.join(powerToysPath, 'shortcuts-export.json'),
    filters: [
      { name: 'JSON', extensions: ['json'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    try {
      const shortcuts = loadShortcuts();
      fs.writeFileSync(result.filePath, JSON.stringify(shortcuts, null, 2));
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('import-shortcuts', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer les raccourcis',
    defaultPath: powerToysPath,
    filters: [
      { name: 'JSON', extensions: ['json'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const data = fs.readFileSync(result.filePaths[0], 'utf8');
      const shortcuts = JSON.parse(data);
      saveShortcuts(shortcuts);
      registerShortcuts();
      return { success: true, count: shortcuts.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('reset-shortcuts', () => {
  try {
    saveShortcuts([]);
    registerShortcuts();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-updates', () => {
  const settings = loadSettings();
  settings.lastCheck = new Date().toISOString();
  saveSettings(settings);
  
  return {
    updateAvailable: false,
    currentVersion: settings.version,
    latestVersion: settings.version,
    lastCheck: settings.lastCheck
  };
});

ipcMain.handle('toggle-autostart', async (event, enable) => {
  const settings = loadSettings();
  settings.autoStart = enable;
  saveSettings(settings);
  
  if (enable) {
    if (process.platform === 'win32') {
      const Registry = require('winreg');
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      
      return new Promise((resolve) => {
        regKey.set('PowerTools', Registry.REG_SZ, process.execPath, (err) => {
          if (err) {
            console.error('Erreur ajout démarrage auto:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
  } else {
    if (process.platform === 'win32') {
      const Registry = require('winreg');
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      
      return new Promise((resolve) => {
        regKey.remove('PowerTools', (err) => {
          if (err && err.message.indexOf('not found') === -1) {
            console.error('Erreur retrait démarrage auto:', err);
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    }
  }
  
  return { success: true };
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});

ipcMain.handle('get-installation-path', () => {
  return powerToysPath;
});
