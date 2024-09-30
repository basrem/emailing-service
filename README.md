# emailing-service
Overview

This project is designed to generate PDF reports from DHIS2 dashboards and send them via email and Telegram. The system uses Puppeteer for PDF generation, Nodemailer for email notifications, and the Telegram Bot API for sending messages and documents.

Features

PDF Generation: Automatically generates PDF reports from specified dashboards.
Email Notifications: Sends generated PDFs to specified email recipients.
Telegram Notifications: Sends PDF reports to specified Telegram chat IDs.
Scheduled Jobs: Allows setting up scheduled jobs for automatic report generation.

Prerequisites

Before running this application, ensure you have the following:

    1. Node.js: Ensure you have Node.js (version 20.x or above) installed. You can download it from nodejs.org.
    2. NPM: Node Package Manager (comes with Node.js).
    3. DHIS2 Credentials: You need valid credentials for logging into the DHIS2 instance.
    4. Email Account: A Gmail account (or another SMTP service) with enabled access for sending emails.
    5. Telegram Bot Token: Create a Telegram bot using BotFather and get your bot token.
    6. Telegram Chat IDs: Collect the chat IDs where the bot will send messages.

Setup Instructions

1. Clone the Repository
git clone <repository-url>
cd <repository-directory>

2. Install Dependencies
npm install

3. Configure Environment Variables
Create a .env file in the root directory of the project with the following content:
TELEGRAM_TOKEN=<Your Telegram Bot Token>
TELEGRAM_CHAT_IDS=<Comma-separated list of chat IDs>
EMAIL_USER=<Your Email Address>
EMAIL_PASSWORD=<Your Email Password>
EMAIL_RECIPIENTS=<Comma-separated list of email recipients>

4. Set Up the Servers Configuration
Create a servers.json file in the root directory of the project with the following structure:
[
  {
    "url": "https://your-dhis2-url",
    "username": "your-dhis2-username",
    "password": "your-dhis2-password",
    "dashboards": [
      {
        "id": "dashboardId1",
        "type": "vs"
      },
      {
        "id": "dashboardId2",
        "type": "dhis2"
      }
    ]
  }
]

5. Run the Application
Start the application with the following command:
node index.js

Usage
    Start the Bot: Send /start to the Telegram bot to receive updates.
    View Logs: Check log.txt for logs related to PDF generation, email sending, and Telegram notifications.

Testing
To test the code:

    Run the application and ensure the scheduled jobs are working as intended.
    Check Telegram for messages and PDF files sent by the bot.
    Verify Email notifications are received at the specified email addresses.

Testing Considerations
    Ensure that the DHIS2 URLs and credentials are correct and that the bot has permissions to send messages to the specified chat IDs.
    Test with valid dashboard IDs to confirm the PDF generation process works.
    Check the log.txt file for any errors or warnings that may occur during the execution.

Troubleshooting
    Invalid Credentials: If you receive login errors, double-check your DHIS2 username and password.
    Email Issues: Ensure your email account allows less secure apps if using Gmail, or check the SMTP settings if using another provider.
    Telegram Errors: If the bot fails to send messages, verify the bot token and chat IDs are correct.

Future Improvements
    Implement additional error handling for failed PDF generation or sending.
    Add more customizable options for users to select which dashboards to generate PDFs for.
    Enhance logging to provide more detailed insights into the application’s performance.