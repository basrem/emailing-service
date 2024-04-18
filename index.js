const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const { PDFDocument } = require("pdf-lib");
const servers = require("./servers.json");
const { scheduleJob } = require("node-schedule");
const { default: axios } = require("axios");

require("dotenv").config();

const { EMAIL_USERNAME, EMAIL_PASSWORD, EMAIL_HOST } = process.env;

class Webpage {
    static async generatePDF(
        url,
        dashboard,
        type,
        username,
        password,
        date = ""
    ) {
        const additionalUrl =
            type === "dhis2"
                ? `dhis-web-dashboard/#/${dashboard}/printoipp`
                : `api/apps/Manifesto-Dashboard/index.html#/reports/${dashboard}`;
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
        const page = await browser.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
        );

        await page.setViewport({
            width: 2048,
            height: 1280,
            deviceScaleFactor: 1,
        });

        await page.goto(url, { waitUntil: "networkidle0", timeout: 0 });
        await page.type("#j_username", username);
        await page.type("#j_password", password);
        console.log("Logging in");
        await page.click("#submit");
        await page.waitForNavigation();
        console.log("Getting the page");
        await page.goto(`${url}/${additionalUrl}`, {
            waitUntil: "networkidle0",
            timeout: 0,
        });
        await page.emulateMediaType("print");
        console.log("Generating pdf");
        const pdf = await page.pdf({
            path: `${dashboard}${date}.pdf`,
            printBackground: true,
            format: "a4",
            landscape: true,
            preferCSSPageSize: true,
        });
        await page.close();
        await browser.close();
        return pdf;
    }
}

class Email {
    static sendEmail(to, subject, text, filename, fileContent) {
        const transporter = nodemailer.createTransport({
            host: EMAIL_HOST,
            port: 587,
            auth: {
                user: EMAIL_USERNAME,
                pass: EMAIL_PASSWORD,
            },
            tls: {
                ciphers: "SSLv3",
            },
        });

        const mailOptions = {
            from: `Data Insights<${EMAIL_USERNAME}>`,
            to: to,
            name: "DHIS2 Analytics Insights",
            subject: subject,
            text: text,
            attachments: [
                {
                    filename: filename,
                    content: fileContent,
                },
            ],
        };
        console.log("sending email");
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }

            console.log("Message sent: %s", info.messageId);
        });
    }
}

(async () => {
    for (const server of servers) {
        for (const dashboard of server.dashboards) {
            if (dashboard.type === "vs") {
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
                    String(data.schedule).replace(
                        "additionalDays",
                        data.additionalDays
                    ),
                    async (date) => {
                        console.log("This is working", date);
                        const pdf = await Webpage.generatePDF(
                            server.url,
                            dashboard.id,
                            dashboard.type,
                            server.username,
                            server.password,
                            date.toISOString()
                        );
                        Email.sendEmail(
                            data.emails,
                            data.name || dashboard.subject,
                            "FYI",
                            `${dashboard.subject}.pdf`,
                            pdf
                        );
                    }
                );
                console.log(job?.name + " Scheduled");
            } else {
                const pdf = await Webpage.generatePDF(
                    server.url,
                    dashboard.id,
                    dashboard.type,
                    server.username,
                    server.password
                );
                const pdfDoc = await PDFDocument.load(pdf);
                const pages = pdfDoc.getPages();
                pdfDoc.removePage(0);
                pdfDoc.removePage(pages.length - 2);
                const modifiedPdfBytes = await pdfDoc.save();
                Email.sendEmail(
                    "socaya@hispuganda.org,jkaruhanga@hispuganda.org,colupot@hispuganda.org,pbehumbiize@hispuganda.org,ssekiwere@hispuganda.org,paul.mbaka@gmail.com",
                    dashboard.subject,
                    "FYI",
                    `${dashboard.subject}.pdf`,
                    modifiedPdfBytes
                );
                scheduleJob(dashboard.id, "0 8 * * MON", async () => {
                    const pdf = await Webpage.generatePDF(
                        server.url,
                        dashboard.id,
                        dashboard.type,
                        server.username,
                        server.password
                    );
                    const pdfDoc = await PDFDocument.load(pdf);
                    const pages = pdfDoc.getPages();
                    pdfDoc.removePage(0);
                    pdfDoc.removePage(pages.length - 2);
                    const modifiedPdfBytes = await pdfDoc.save();
                    Email.sendEmail(
                        "socaya@hispuganda.org,jkaruhanga@hispuganda.org,colupot@hispuganda.org,pbehumbiize@hispuganda.org,ssekiwere@hispuganda.org,paul.mbaka@gmail.com",
                        dashboard.subject,
                        "FYI",
                        `${dashboard.subject}.pdf`,
                        modifiedPdfBytes
                    );
                });
            }
        }
    }
})();
