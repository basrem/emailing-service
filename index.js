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

// const webhookUrl = process.env.WEBHOOK_URL;

// Initialize the Telegram bot
const telegramToken = process.env.TELEGRAM_TOKEN; //|| "YOUR_TELEGRAM_BOT_TOKEN";
const telegramChatId = process.env.TELEGRAM_CHAT_ID; //|| "YOUR_CHAT_ID"; // Set your chat/group ID

if (!telegramToken || !telegramChatId) {
  logToFile("Missing Telegram token or chat ID");
  throw new Error("Telegram token or chat ID not provided.");
}

const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${telegramToken}`; // Define webhook URL once

const bot = new TelegramBot(telegramToken, {
  polling: false,
  //   interval: 5000, // Poll every 5 seconds
  //   timeout: 120,
}); // Wait up to 120 seconds for a response

function logToFile(message) {
  fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
}
logToFile("Telegram Token: " + telegramToken);
logToFile("Telegram Chat ID: " + telegramChatId);

bot.sendMessage(telegramChatId, "Bot is running").catch((error) => {
  logToFile("Failed to send test message: " + error.message);
});

// Set the webhook with Telegram
// bot.setWebHook(`${webhookUrl}/webhook/${telegramToken}`).then(() => {
//     logToFile(`Webhook set at: ${webhookUrl}/webhook/${telegramToken}`);
//   }).catch((error) => {
//     logToFile(`Error setting webhook: ${error.message}`);
//   });

bot
  .setWebHook(webhookUrl)
  .then(() => {
    logToFile(`Webhook set at: ${webhookUrl}`);
  })
  .catch((error) => {
    logToFile(`Error setting webhook: ${error.message}`);
  });

// Webhook route for Telegram
app.use(bodyParser.json()); // Parse incoming JSON requests
app.use(timeout("5s")); // Set a 5-second timeout for requests

app.post(`/webhook/${telegramToken}`, (req, res) => {
  bot.processUpdate(req.body); // Process the incoming Telegram update
  console.log("Received update:", req.body); // Log the incoming update
  res.sendStatus(200); // Respond with 200 OK to Telegram
});

// Start Express server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logToFile(`Server is running on port ${port}`);
  console.log(`Server is running on port ${port}`);
});

// Other functions like PDF generation and email sending remain unchanged...

//   bot.on("message", (msg) => {
//     bot.sendMessage(telegramChatId, "Bot is running").catch((error) => {
//       logToFile("Failed to send test message: " + error.message);
//     });
//   });

// Handle webhook-specific errors
bot.on("webhook_error", (error) => {
  logToFile(`Telegram webhook error: ${error.message}`);
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

    // const finalUrl =
    //   url.replace("/dhis-web-commons/security/login.action", "/") +
    //   additionalUrl;
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
      await browser.close();
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
    to: "basremsingh.em@gmail.com",
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

async function sendPDFToTelegram(pdfPath) {
  try {
    logToFile("Attempting to send PDF to Telegram...");
    const fileStream = fs.createReadStream(pdfPath);

    logToFile("Telegram Token: " + telegramToken);
    logToFile("Telegram Chat ID: " + telegramChatId);
    logToFile("PDF Path: " + pdfPath);

    if (fs.existsSync(pdfPath)) {
      const fileStream = fs.createReadStream(pdfPath);
      await bot.sendDocument(telegramChatId, fileStream, {
        caption: "Here is your dashboard PDF",
      });
    } else {
      logToFile(`Error: PDF file at ${pdfPath} does not exist.`);
    }

    await bot.sendDocument(telegramChatId, fileStream, {
      caption: "Here is your dashboard PDF",
    });
    logToFile("PDF sent to Telegram successfully.");
  } catch (error) {
    logToFile("Error sending PDF to Telegram: " + error.message);
  }
}

async function sendMessageToTelegram(chatId, message) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
      }
    );

    logToFile("Message sent to Telegram:", response.data);
  } catch (error) {
    logToFile("Error sending message to Telegram:", error.message);
  }
}

// bot.on("polling_error", (error) => {
//   if (error.code === "EFATAL") {
//     logToFile(`Telegram polling fatal error: ${error.message}`);
//     if (error.errors) {
//       error.errors.forEach((err, index) => {
//         logToFile(`Error ${index + 1}: ${err.message}`);
//       });
//     }
//   }
// });

// // More graceful retry with exponential backoff
// bot.on("polling_error", (error) => {
//   if (error instanceof AggregateError) {
//     error.errors.forEach((err) => {
//       logToFile(`Telegram polling error: ${err.message}`);
//     });
//   } else {
//     logToFile(`Telegram polling error: ${error.message}`);
//   }

//   if (error.code === "EFATAL") {
//     logToFile(`Telegram polling fatal error: ${error.message}`);
//     let retryCount = 0;
//     const maxRetries = 5;

//     const retryPolling = () => {
//       if (retryCount < maxRetries) {
//         retryCount++;
//         const backoffTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
//         setTimeout(() => {
//           logToFile(
//             `Retrying Telegram polling... (${retryCount}/${maxRetries})`
//           );
//           bot
//             .startPolling()
//             .catch((e) => logToFile("Error restarting polling: " + e.message));
//         }, backoffTime);
//       } else {
//         logToFile("Max retries reached. Stopping further retries.");
//       }
//     };

//     retryPolling();
//   }
// });

// const retry = (fn, retries = 3, delay = 1000) => {
//   return fn().catch((err) => {
//     if (retries > 1) {
//       return new Promise((resolve) => {
//         setTimeout(() => resolve(retry(fn, retries - 1, delay * 2)), delay);
//       });
//     } else {
//       throw err;
//     }
//   });
// };

// Usage
//await retry(() => sendPDFToTelegram(pdfPath), 3, 2000);

(async () => {
  logToFile("Starting Telegram and email PDF process...");

  // Iterate through servers and dashboards
  for (const server of servers) {
    for (const dashboard of server.dashboards) {
      logToFile("Dashboard Type: " + dashboard.type);
      logToFile(
        "Processing dashboard ID: " + dashboard.id + " Type: " + dashboard.type
      );

      // if (dashboard.type === "vs") {
      if (dashboard.type === "vs" || dashboard.type === "dhis2") {
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

              //   if (pdf) {
              //     logToFile("PDF generated for dashboard: " + dashboard.id);
              //     // Send message to Telegram
              //     await sendMessageToTelegram(telegramChatId, `PDF for dashboard ${dashboard.id} generated successfully.`);
              //   }

              //   // Existing logic for sending email and Telegram PDF
              // } catch (error) {
              //   logToFile("Error during PDF generation: " + error.message);
              //   // Send error message to Telegram
              //   await sendMessageToTelegram(telegramChatId, `Error generating PDF for dashboard ${dashboard.id}: ${error.message}`);
              // }

              // Check if the PDF is valid
              if (!pdf || pdf.length === 0) {
                throw new Error("PDF generation failed or the PDF is empty.");
              }

              // Save the PDF to the file system
              await fs.promises.writeFile(pdfPath, pdf);

              // Using Promise.all with try-catch to handle any errors

              await Promise.all([
                sendEmail(pdfPath, "basremsingh.em@gmail.com"),
                sendPDFToTelegram(pdfPath),
              ]).catch((error) => {
                logToFile(`Error in concurrent operations: ${error.message}`);
              });

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
        //   try {
        //     logToFile("Starting concurrent operations: Email and Telegram");

        //         await Promise.all([
        //           (async () => {
        //             try {
        //               logToFile("Sending email for dashboard: " + dashboard.id);
        //               await sendEmail(pdfPath, "basremsingh.em@gmail.com");
        //               logToFile(
        //                 "Email successfully sent for dashboard: " + dashboard.id
        //               );
        //             } catch (error) {
        //               logToFile(`Error sending email: ${error.message}`);
        //             }
        //           })(),

        //           (async () => {
        //             try {
        //               logToFile(
        //                 "Attempting to send PDF to Telegram for dashboard: " +
        //                   dashboard.id
        //               );
        //               logToFile(
        //                 "Calling sendPDFToTelegram with path: " + pdfPath
        //               );
        //               // await sendPDFToTelegram(pdfPath);
        //               await retry(() => sendPDFToTelegram(pdfPath), 3, 2000);
        //               logToFile(
        //                 "Telegram PDF successfully sent for dashboard: " +
        //                   dashboard.id
        //               );
        //             } catch (error) {
        //               logToFile(
        //                 `Error sending PDF to Telegram: ${error.message}`
        //               );
        //             }
        //           })(),
        //         ]);

        //         logToFile(
        //           "PDF successfully sent to Telegram and email for dashboard: " +
        //             dashboard.id
        //         );
        //       } catch (error) {
        //         logToFile(
        //           "Error in Promise.all during email/Telegram send: " +
        //             error.message
        //         );
        //       }
        //     } catch (error) {
        //       logToFile("Error during scheduled job: " + error.message);
        //     }
        //   }
        // );

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

          await sendEmail(pdfPath, "basremsingh.em@gmail.com");
        } catch (error) {
          logToFile("Error generating PDF: " + error.message);
          logToFile(`Error sending email: ` + error.message);
          console.error("Error details: ", error);
        }
      }
    }
  }
})();
