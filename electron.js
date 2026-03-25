const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const http = require('http');
const path = require('path');

let mainWindow;
let nextProcess;

function showError(message) {
  const errWin = new BrowserWindow({ width: 800, height: 400 });
  errWin.loadURL('data:text/html,<pre style="font-size:14px;padding:20px;white-space:pre-wrap;">' + encodeURIComponent(message) + '</pre>');
}

function waitForServer(url, retries = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else if (retries > 0) { retries--; setTimeout(attempt, delay); }
        else reject(new Error('Server never became reachable'));
      }).on('error', () => {
        if (retries > 0) { retries--; setTimeout(attempt, delay); }
        else reject(new Error('Server never became reachable'));
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
  const appPath = app.getAppPath();
  // node_modules is unpacked outside the .asar archive
  const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
  const nextBin = path.join(unpackedPath, 'node_modules', '.bin', 'next');

  let logs = '';
  logs += 'appPath: ' + appPath + '\n';
  logs += 'unpackedPath: ' + unpackedPath + '\n';
  logs += 'nextBin: ' + nextBin + '\n\n';

  nextProcess = exec(`"${nextBin}" start`, {
    cwd: unpackedPath,
    env: { ...process.env, NODE_ENV: 'production' }
  });

  nextProcess.stdout.on('data', (data) => { logs += '[stdout] ' + data; });
  nextProcess.stderr.on('data', (data) => { logs += '[stderr] ' + data; });
  nextProcess.on('exit', (code) => { logs += '\n[exit] code: ' + code; });

  waitForServer('http://localhost:3000')
    .then(createWindow)
    .catch((err) => {
      showError('SERVER FAILED TO START\n\n' + err.message + '\n\nLogs:\n' + logs);
    });
});

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
