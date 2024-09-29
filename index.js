const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");
const servers = require("./servers.json");
const { scheduleJob } = require("node-schedule");
const { default: axios } = require("axios");
const fs = require("fs");
const nodemailer = require("nodemailer");
const TelegramBot = require("node-telegram-bot-api"); // Telegram bot library
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const timeout = require("connect-timeout");
const path = require("path");

require("dotenv").config();

const logFilePath = "log.txt";

let chatIds = [1408012729, 6051915063]; // Example of multiple chat IDs

// Delay function to avoid Telegram rate limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// // Define the path to your PDF file
// const pdfPath = `${dashboard.id}${date.toISOString()}.pdf`;

// Initialize the Telegram bot
const telegramToken = process.env.TELEGRAM_TOKEN; //|| // Get the ids and convert them into an array of string
let envtelegramChatIds = process.env.TELEGRAM_CHAT_IDS; //|| "YOUR_CHAT_ID"; // Set your chat/group ID

const telegramChatIds = envtelegramChatIds.split(",");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: true,
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Welcome! This bot can send you PDF reports. Please stay tuned for updates!"
  );
});

function logToFile(message) {
  fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
}
logToFile("Telegram Token: " + telegramToken);
logToFile("Telegram Chat ID: " + envtelegramChatIds);
console.log("Telegram Token: " + telegramToken);
console.log("Telegram Chat ID: " + envtelegramChatIds);

// Start Express server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logToFile(`Server is running on port ${port}`);
  console.log(`Server is running on port ${port}`);
});

class Webpage {
  static async generatePDF(
    url,
    dashboardId,
    type,
    username,
    password,
    date = ""
  ) {
    const additionalUrl =
      type === "dhis2"
        ? `dhis-web-dashboard/#/${dashboardId}`
        : `api/apps/Manifesto-Dashboard/index.html#/reports/${dashboardId}`;

    const finalUrl = `${url.replace(
      "/dhis-web-commons/security/login.action",
      "/"
    )}/${additionalUrl}`;

    logToFile("Base URL: " + url);
    logToFile("Additional URL: " + additionalUrl);
    logToFile("Final URL: " + finalUrl);

    console.log("Starting Puppeteer...");
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--start-maximized",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-features=BlockInsecurePrivateNetworkRequests",
        "--disable-features=IsolateOrigins",
        "--disable-site-isolation-trials",
        "--disable-web-security",
        "--proxy-server='direct://'",
        "--proxy-bypass-list=*",
        "--disable-features=site-per-process",
      ],
    });
    console.log("Browser launched");

    const page = await browser.newPage();
    console.log("New page opened");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
    );

    await page.setViewport({
      width: 2048,
      height: 1280,
      deviceScaleFactor: 1,
    });

    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.type("#username.jsx-3353877153", username);
      await page.type("#password.jsx-31445346", password);
      logToFile("Logging in");
      // await page.click("#jsx-1796590446.primary");
      await page.click("button.jsx-1796590446.primary");
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });

      console.log("Navigated to dashboard");

      const cookies = await page.cookies();
      logToFile("Cookies after login: " + JSON.stringify(cookies));

      logToFile("Logged in successfully, navigating to dashboard");

      await page.goto(finalUrl, { waitUntil: "networkidle2", timeout: 60000 });

      logToFile("Dashboard loaded successfully");

      await page.emulateMediaType("print");
      logToFile("Generating PDF");
      const pdf = await page.pdf({
        path: `${dashboardId}${date}.pdf`,
        printBackground: true,
        format: "a4",
        landscape: true,
        preferCSSPageSize: true,
      });

      await page.close();

      logToFile("PDF generated and saved as: " + `${dashboardId}${date}.pdf`);
      return pdf;
    } catch (error) {
      logToFile("Error generating PDF: " + error.message);
      await browser.close();
      throw error;
    }
  }
}
async function sendEmail(pdfPath, email) {
  let transporter = nodemailer.createTransport({
    service: "gmail", // or any other service
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASSWORD, // Your email password
    },
  });
  console.log(
    "Email Config:",
    process.env.EMAIL_USER,
    process.env.EMAIL_PASSWORD
  );
  logToFile("Sending email with attachment path: " + pdfPath);

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_RECIPIENTS, //"basremsingh.em@gmail.com",
    //cc: "iwanyana@musph.ac.ug,amutesasira@hispuganda.org",
    // bcc: "kbitarabeho@gmail.com,reaganmeant@gmail.com",
    subject: "Dashboard PDF",
    text: "Here is the dashboard PDF you requested.",
    attachments: [
      {
        filename: "dashboard.pdf",
        path: pdfPath,
      },
    ],
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    logToFile(`Email sent to ${email}: ` + info.response);
  } catch (error) {
    logToFile(`Error sending email to ${email}: ` + error.message);
  }
}

async function sendPDFToTelegram(chatIds, pdfPath, telegramToken) {
  try {
    logToFile("Attempting to send PDF to Telegram...");
    logToFile("Telegram Token: " + telegramToken);
    logToFile("Telegram Chat IDs: " + chatIds.join(", "));
    logToFile("PDF Path: " + pdfPath);

    // Check if the PDF file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Error: PDF file at ${pdfPath} does not exist.`);
    }

    // Loop through each chat ID and send the PDF
    for (const chatId of chatIds) {
      logToFile(`Sending PDF to chat ID: ${chatId}`);

      try {
        const fileStream = fs.createReadStream(pdfPath); // Reopen stream for each send
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("document", fileStream); // Attach the PDF file

        // Make API call to Telegram to send the PDF
        const response = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`,
          formData,
          { headers: formData.getHeaders() }
        );

        logToFile(
          `Response from Telegram for chat ID ${chatId}: ${JSON.stringify(
            response.data
          )}`
        );
      } catch (error) {
        logToFile(
          `Error sending PDF to chat ID ${chatId}: ${
            error.response?.data?.description || error.message
          }`
        );
      }

      // Introduce a delay to respect Telegram's rate limits
      await delay(1000); // Adjust the delay time if needed
    }

    logToFile("PDF sent to all chat IDs successfully.");
  } catch (error) {
    logToFile(`Error sending PDF to Telegram: ${error.message}`);
    logToFile("Full error: " + JSON.stringify(error, null, 2));
  }
}

async function sendTextMessage(chatIds, text) {
  try {
    logToFile("Attempting to send text message to Telegram...");
    logToFile("Telegram Token: " + telegramToken);
    logToFile("Telegram Chat IDs: " + chatIds.join(", "));
    logToFile("Text Message: " + text);

    // Iterate over each chat ID
    for (const chatId of chatIds) {
      try {
        logToFile(`Sending message to chat ID: ${chatId}`);

        const response = await bot.sendMessage(chatId.trim(), text); // Trim whitespace from chat IDs
        logToFile(
          `Response from Telegram for chat ID ${chatId}: ${JSON.stringify(
            response
          )}`
        );
      } catch (error) {
        logToFile(
          `Error sending message to chat ID ${chatId}: ${error.message}`
        );
      }

      // Introduce a delay to avoid hitting Telegram's rate limits
      await delay(1000); // Adjust this delay as needed
    }

    logToFile("Text message sent to all chat IDs successfully.");
  } catch (error) {
    logToFile(`Error sending text message to Telegram: ${error.message}`);
  }
}

// Usage: Pass in the array of chat IDs
// await sendTextMessage(
//   telegramChatIds,
//   "This is a test message from your Node.js application."
// );

// Replace 'YOUR_CHAT_ID' with the actual chat ID you want to send the message to
const chatId = 1408012729;
const text = "This is a test message from your Node.js application.";

(async () => {
  logToFile("Starting Telegram and email PDF process...");

  //Test whether telegram bot can send messages
  await sendTextMessage(
    telegramChatIds,
    "This is a test message from your Node.js application."
  );

  // Iterate through servers and dashboards
  for (const server of servers) {
    for (const dashboard of server.dashboards) {
      logToFile("Dashboard Type: " + dashboard.type);
      logToFile(
        "Processing dashboard ID: " + dashboard.id + " Type: " + dashboard.type
      );

      // // if (dashboard.type === "vs") {
      // if (dashboard.type === "vs" || dashboard.type === "dhis2") {
      //   logToFile("Scheduling job for dashboard: " + dashboard.id);
      //   logToFile(
      //     `Processing dashboard with type ${dashboard.type} for Telegram and email.`
      //   );
      if (dashboard.type === "vs") {
        logToFile("Scheduling job for dashboard: " + dashboard.id);
        logToFile(
          `Processing dashboard with type ${dashboard.type} for Telegram and email.`
        );

        // Fetch the schedule and set up the job
        const { data } = await axios.get(
          `${server.url}/api/dataStore/i-reports/${dashboard.id}`,
          {
            auth: {
              username: server.username,
              password: server.password,
            },
          }
        );

        const job = scheduleJob(
          dashboard.id,
          String(data.schedule).replace("additionalDays", data.additionalDays),
          async (date) => {
            logToFile(`Job started for dashboard: ${dashboard.id} at ${date}`);
            logToFile("Job scheduled for: " + date);
            logToFile(
              "Job started for dashboard: " + dashboard.id + " at " + new Date()
            );
            logToFile(
              "Executing job for dashboard: " +
                dashboard.id +
                " at " +
                new Date()
            );

            try {
              // Define pdfPath based on the dashboard and date
              const pdfPath = `${dashboard.id}${date.toISOString()}.pdf`;
              logToFile("Generating PDF for dashboard: " + dashboard.id);

              // Generate the PDF
              const pdf = await Webpage.generatePDF(
                server.url,
                dashboard.id,
                dashboard.type,
                server.username,
                server.password,
                date.toISOString()
              );

              logToFile("PDF generated for dashboard: " + dashboard.id);

              // Check if the PDF is valid
              if (!pdf || pdf.length === 0) {
                throw new Error("PDF generation failed or the PDF is empty.");
              }

              // Save the PDF to the file system
              await fs.promises.writeFile(pdfPath, pdf);

              // Using Promise.all with try-catch to handle any errors
              // try {
              //   await sendEmail(pdfPath, process.env.EMAIL_RECIPIENTS);
              //   await sendPDFToTelegram(pdfPath);
              // } catch (error) {
              //   logToFile(`Error in concurrent operations: ${error.message}`);
              // }
              try {
                await Promise.all([
                  sendPDFToTelegram(telegramChatIds, pdfPath, telegramToken),
                  sendEmail(pdfPath, process.env.EMAIL_RECIPIENTS),
                ]);
              } catch (errors) {
                // Handle individual errors
                for (const error of errors) {
                  logToFile(`Error: ${error.message}`);
                  // Optionally send an error notification to Telegram
                }
              }
              logToFile(
                "PDF successfully sent to Telegram and email for dashboard: " +
                  dashboard.id
              );
            } catch (error) {
              logToFile("Error during scheduled job: " + error.message);
              await sendMessageToTelegram(
                telegramChatId,
                `Error in job for dashboard ${dashboard.id}: ${error.message}`
              );
            }
          }
        );

        const jobName = `job_${dashboard.id}_${new Date().toISOString()}`;
        // logToFile(job?.name + " Scheduled");
        //logToFile(job?.name + " Scheduled for dashboard: " + dashboard.id);
        logToFile(`${jobName} Scheduled for dashboard: ${dashboard.id}`);
      } else {
        logToFile(
          "Skipping dashboard: " +
            dashboard.id +
            " due to unsupported type: " +
            dashboard.type
        );

        try {
          const pdfPath = `${dashboard.id}.pdf`;
          const pdf = await Webpage.generatePDF(
            server.url,
            dashboard.id,
            dashboard.type,
            server.username,
            server.password
          );

          if (!pdf || pdf.length === 0) {
            throw new Error("PDF generation failed or the PDF is empty.");
          }

          // Save the PDF to the file system
          await fs.promises.writeFile(pdfPath, pdf);

          await sendEmail(pdfPath, process.env.EMAIL_RECIPIENTS); //"basremsingh.em@gmail.com");
        } catch (error) {
          logToFile("Error generating PDF: " + error.message);
          logToFile(`Error sending email: ` + error.message);
          console.error("Error details: ", error);
        }
      }
    }
  }
})();
