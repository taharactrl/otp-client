const path = require("path");
const logger = require("@taharactrl/simple-logger").createLogger(
  process.env.LOG_LEVEL || "error",
  "otp-client"
);
const { v4: uuid } = require("uuid");
const { ipcRenderer } = require("electron");
const { authenticator } = require("otplib");
const otpAuthMigrationParser = require("otpauth-migration-parser");

const QrScanner = require("qr-scanner");
QrScanner.WORKER_PATH = path.join(
  __dirname,
  "..",
  "node_modules",
  "qr-scanner",
  "qr-scanner-worker.min.js"
);

logger.debug("preload");

const otpItemTemplate = (otpUUID, secretValue) => {
  return `
    <div><input class="otp-title" id="otp-title-${otpUUID}"></div>
    <div><input class="otp" id="otp-${otpUUID}" data-secret-uuid="${otpUUID}">
    </div>
    <div><input class="otp-time-remaining" id="otp-time-remaining-${otpUUID}" data-secret-uuid="${otpUUID}">
    </div>

    <div>
        <input id="otp-secret-value-${otpUUID}" data-secret-uuid="${otpUUID}" type="text" class="otp-secret" name="otp-secret" value="${secretValue}">
      </div>
      <div>
        <button id="delete-otp-item-${otpUUID}" data-secret-uuid="${otpUUID}" class="delete-otp-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-x-circle-fill" viewBox="0 0 16 16">
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"/>
          </svg>
        </button>
      </div>
  `;
};

document.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.on("save-config-reply", (event, arg) => {
    logger.debug(event, arg);
  });

  // ipcRenderer.send("send-config", JSON.stringify({ message: "test" }));

  document.getElementById("save-config").addEventListener("click", () => {
    let els = document.querySelectorAll("#config-table .otp-secret");
    let secrets = [];
    for (let el of els) {
      if (el.parentElement.parentElement.classList.contains("hide")) {
        continue;
      }
      secrets.push(el.value);
    }
    logger.debug(secrets);
    ipcRenderer.send("save-config", JSON.stringify({ otpSecrets: secrets }));
  });

  ipcRenderer.on("config-load-reply", (event, arg) => {
    logger.debug(arg);
    const config = JSON.parse(arg);

    let configTableHTML = "";
    const otpUUIDs = [];
    for (let secret of config.otpSecrets) {
      const otpUUID = uuid();
      configTableHTML += `
        <div class="secret-item" id="secret-item-${otpUUID}" data-secret-uuid="${otpUUID}">
          ${otpItemTemplate(otpUUID, secret)}
        </div>
      `;
      otpUUIDs.push(otpUUID);
    }

    document.getElementById("config-table").innerHTML = configTableHTML;

    for (let otpUUID of otpUUIDs) {
      assignEventDeleteSecret(otpUUID);
    }
  });

  ipcRenderer.send("config-load");

  document.getElementById("add-otp-item").addEventListener("click", () => {
    let configTableHTML = document.getElementById("config-table");
    const otpUUID = uuid();
    let item = document.createElement("div");
    item.className = "secret-item";
    item.id = `secret-item-${otpUUID}`;
    item.setAttribute("data-secret-uuid", otpUUID);
    item.innerHTML = otpItemTemplate(otpUUID, "");

    configTableHTML.appendChild(item);
    // document.getElementById("config-table").innerHTML = configTableHTML;

    assignEventDeleteSecret(otpUUID);
  });

  let qrScanner = null;
  document.getElementById("cancel-qr-scanner").addEventListener("click", () => {
    // document.getElementById("qr-scanner-page").classList.add("hide");
    document.getElementById("qr-scanner-page").classList.add("qr-scanner-hide");
    document
      .getElementById("qr-scanner-page")
      .classList.remove("qr-scanner-show");

    if (qrScanner) {
      qrScanner.stop();
    }
  });

  document.getElementById("launch-qr-scanner").addEventListener("click", () => {
    // document.getElementById("qr-scanner-page").classList.remove("hide");
    document
      .getElementById("qr-scanner-page")
      .classList.remove("qr-scanner-hide");
    document.getElementById("qr-scanner-page").classList.add("qr-scanner-show");

    qrScanner = new QrScanner(
      document.getElementById("qr-scanner-video"),
      async (result) => {
        logger.debug(result);
        qrScanner.stop();
        // document.getElementById("qr-scanner-page").classList.add("hide");
        document
          .getElementById("qr-scanner-page")
          .classList.add("qr-scanner-hide");
        document
          .getElementById("qr-scanner-page")
          .classList.remove("qr-scanner-show");

        if (result.indexOf("otpauth://") == 0) {
          let configTableHTML = document.getElementById("config-table");
          const otpUUID = uuid();
          let item = document.createElement("div");
          item.className = "secret-item";
          item.id = `secret-item-${otpUUID}`;
          item.setAttribute("data-secret-uuid", otpUUID);
          item.innerHTML = otpItemTemplate(otpUUID, result);

          configTableHTML.appendChild(item);
          // document.getElementById("config-table").innerHTML = configTableHTML;

          assignEventDeleteSecret(otpUUID);
        } else if (result.indexOf("otpauth-migration://offline") == 0) {
          let otpParameters = await otpAuthMigrationParser(result);

          let configTableHTML = document.getElementById("config-table");

          for (let otpParameter of otpParameters) {
            const otpUUID = uuid();
            let item = document.createElement("div");
            item.className = "secret-item";
            item.id = `secret-item-${otpUUID}`;
            item.setAttribute("data-secret-uuid", otpUUID);
            item.innerHTML = otpItemTemplate(
              otpUUID,
              `otpauth://${otpParameter.type}/${otpParameter.issuer}:${otpParameter.name}?secret=${otpParameter.secret}`
            );

            configTableHTML.appendChild(item);
            // document.getElementById("config-table").innerHTML = configTableHTML;

            assignEventDeleteSecret(otpUUID);
          }
        }
      }
    );

    qrScanner.start();
  });
});

const assignEventDeleteSecret = (otpUUID) => {
  document
    .getElementById(`delete-otp-item-${otpUUID}`)
    .addEventListener("click", () => {
      document.getElementById(`secret-item-${otpUUID}`).classList.add("hide");
    });
};

setInterval(() => {
  let els = document.querySelectorAll("#config-table .otp-secret");
  for (let el of els) {
    const otpUUID = el.getAttribute("data-secret-uuid");
    const optInfo = el.value;
    if (optInfo.indexOf("otpauth://totp") != 0) {
      continue;
    }
    const url = new URL(optInfo);
    const secret = url.searchParams.get("secret");
    if (!secret) {
      continue;
    }
    const otp = authenticator.generate(secret);
    const otpTimeRemaining = authenticator.timeRemaining();

    document.getElementById(`otp-title-${otpUUID}`).value = decodeURIComponent(
      url.pathname.slice(7, 1000)
    );
    document.getElementById(`otp-${otpUUID}`).value = otp;
    document.getElementById(`otp-time-remaining-${otpUUID}`).value =
      ("00" + otpTimeRemaining).slice(-2) + "s";
  }
}, 100);
