const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const http = require('http');
const path = require('path');

let mainWindow;
let nextProcess;

function waitForServer(url, retries = 30, delay = 1000) {
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
  const appDir = path.dirname(app.getAppPath());
  const nextBin = path.join(appDir, 'app', 'node_modules', '.bin', 'next');
  const appPath = app.getAppPath();

  nextProcess = exec(`node "${nextBin}" start`, {
    cwd: appPath,
    env: { ...process.env, NODE_ENV: 'production' }
  });

  nextProcess.stdout.on('data', (data) => console.log(data));
  nextProcess.stderr.on('data', (data) => console.error(data));

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
