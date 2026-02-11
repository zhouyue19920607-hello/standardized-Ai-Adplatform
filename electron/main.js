const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

// 启动Python后端
function startBackend() {
    const isDev = !app.isPackaged;

    if (isDev) {
        // 开发环境：使用Python脚本
        const backendPath = path.join(__dirname, '../backend/server.mjs');
        backendProcess = spawn('node', [backendPath], {
            env: { ...process.env, PORT: '5000' }
        });
    } else {
        // 生产环境：使用打包的可执行文件
        const backendPath = path.join(
            process.resourcesPath,
            'backend',
            process.platform === 'win32' ? 'server.exe' : 'server'
        );
        backendProcess = spawn(backendPath);
    }

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`);
    });
}

// 创建主窗口
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'AI广告平台',
        backgroundColor: '#0f172a'
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        // 开发环境：加载Vite开发服务器
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // 生产环境：加载打包的HTML
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // 窗口关闭事件
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 应用准备就绪
app.whenReady().then(() => {
    console.log('Starting AI Platform...');

    // 启动后端
    startBackend();

    // 等待后端启动（3秒）
    setTimeout(() => {
        createWindow();
    }, 3000);
});

// 所有窗口关闭
app.on('window-all-closed', () => {
    // 关闭后端进程
    if (backendProcess) {
        backendProcess.kill();
    }

    // macOS上保持应用运行
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 激活应用
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 应用退出前
app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
    }
});
