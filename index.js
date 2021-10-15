const path = require("path");
const fs = require("fs");
const logger = require("@taharactrl/simple-logger").createLogger(
  process.env.LOG_LEVEL || "error",
  "otp-client",
  "UTC",
  path.join(__dirname, "app.log")
);
const { app, BrowserWindow, ipcMain } = require("electron");

const createWindows = () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, "js", "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "app.html"));
  if (["debug", "trace"].includes(process.env.LOG_LEVEL)) {
    win.webContents.openDevTools();
  }
  ipcMain.on("save-config", (event, arg) => {
    logger.debug(event);
    logger.debug(arg);
    fs.writeFileSync(
      path.join(__dirname, "config.json"),
      JSON.stringify(JSON.parse(arg), null, "    "),
      "utf-8"
    );
    event.reply("save-config-reply", "ok");
  });

  ipcMain.on("config-load", (event, arg) => {
    if (fs.existsSync(path.join(__dirname, "config.json"))) {
      const configFile = fs.readFileSync(
        path.join(__dirname, "config.json"),
        "utf-8"
      );
      logger.error(configFile);
      event.reply("config-load-reply", configFile);
    } else {
      event.reply(
        "config-load-reply",
        JSON.stringify({
          otpSecrets: [],
        })
      );
    }
  });
};

app.whenReady().then(() => {
  createWindows();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
