const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const http = require('http');

let mainWindow;
let nextProcess;

function waitForServer(url, retries = 20, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else if (retries > 0) { retries--; setTimeout(attempt, delay); }
        else reject(new Error('Server did not start'));
      }).on('error', () => {
        if (retries > 0) { retries--; setTimeout(attempt, delay); }
        else reject(new Error('Server did not start'));
      });
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false }
  });
  mainWindow.loadURL('http://localhost:3000');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', () => {
  nextProcess = exec('node node_modules/.bin/next start', { cwd: __dirname });

  waitForServer('http://localhost:3000')
    .then(createWindow)
    .catch((err) => {
      console.error('Failed to start Next.js server:', err);
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
