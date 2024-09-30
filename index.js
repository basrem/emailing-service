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
const FormData = require("form-data");

require("dotenv").config();

const logFilePath = "log.txt";

// Delay function to avoid Telegram rate limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Initialize the Telegram bot
const telegramToken = process.env.TELEGRAM_TOKEN;
let envtelegramChatIds = process.env.TELEGRAM_CHAT_IDS; // Set your chat/group ID and Get the ids and convert them into an array of string

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
    to: process.env.EMAIL_RECIPIENTS,
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

const sendToTelegram = async (telegramChatIds, pdfPath) => {
  try {
    logToFile("Attempting to send text and PDF to Telegram...");
    logToFile("Telegram Token: " + process.env.TELEGRAM_TOKEN);
    logToFile("Telegram Chat IDs: " + telegramChatIds.join(", "));
    logToFile("PDF Path: " + pdfPath);

    // Check if the PDF file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Error: PDF file at ${pdfPath} does not exist.`);
    }

    const urlSendMessage = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
    const urlSendDocument = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`;

    // Loop through all chat IDs
    for (const chatId of telegramChatIds) {
      // Correct variable
      logToFile(`Processing chat ID: ${chatId.trim()}`); // Log current chat ID

      try {
        // Send text message first
        const messageParams = {
          chat_id: chatId.trim(), // Trim the current chat ID
          text: "This is a test message from your Node.js application.",
        };
        const textResponse = await axios.post(urlSendMessage, messageParams);
        logToFile(
          `Response from Telegram for chat ID ${chatId.trim()}: ${JSON.stringify(
            textResponse.data
          )}`
        );
      } catch (error) {
        logToFile(
          `Error sending text to chat ID ${chatId.trim()}: ${
            error.response?.data?.description || error.message
          }`
        );
        continue; // Skip to the next chat ID if the text message fails
      }

      try {
        // 2. Send PDF file by opening a new file stream for each chat ID
        logToFile(`Sending PDF to chat ID: ${chatId.trim()}`); // Log current chat ID

        // Create a new stream for each chat ID
        const formData = new FormData();
        const fileStream = fs.createReadStream(pdfPath); // Open stream
        formData.append("chat_id", chatId.trim()); // Trim the current chat ID
        formData.append("document", fileStream);
        formData.append("caption", "Here is your dashboard PDF"); // Optional caption

        // Call the Telegram API with the correct token in the URL
        const pdfResponse = await axios.post(urlSendDocument, formData, {
          headers: {
            ...formData.getHeaders(),
          },
        });

        logToFile(
          `Response from Telegram for chat ID ${chatId.trim()}: ${JSON.stringify(
            pdfResponse.data
          )}`
        );

        // Close the stream after sending the file
        fileStream.close();
      } catch (error) {
        logToFile(
          `Error sending PDF to chat ID ${chatId.trim()}: ${
            error.response?.data?.description || error.message
          }`
        );
      }
      // Introduce a delay to respect Telegram's rate limits
      await delay(1000); // Adjust the delay time if needed
    }

    logToFile("Text and PDF sent to all chat IDs successfully.");
  } catch (error) {
    logToFile(`Error in sendToTelegram: ${error.message}`);
    logToFile(`Detailed error: ${JSON.stringify(error.response, null, 2)}`);
  }
};

(async () => {
  logToFile("Starting Telegram and email PDF process...");

  // Iterate through servers and dashboards
  for (const server of servers) {
    for (const dashboard of server.dashboards) {
      logToFile("Dashboard Type: " + dashboard.type);
      logToFile(
        "Processing dashboard ID: " + dashboard.id + " Type: " + dashboard.type
      );

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
              logToFile("PDF saved successfully at: " + pdfPath);

              try {
                logToFile("PDF Path: " + pdfPath); // Ensure this prints the correct path

                await Promise.all([
                  await sendToTelegram(telegramChatIds, pdfPath),
                  await sendEmail(pdfPath, process.env.EMAIL_RECIPIENTS),
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

          await sendToTelegram(telegramChatIds, pdfPath);

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
