import express, { NextFunction, Request, Response } from "express";
import { Client, Events, GatewayIntentBits } from "discord.js";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import "dotenv/config";

const LOG_PATH = path.join(__dirname, "logs");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (!fs.existsSync(LOG_PATH)) {
  fs.mkdirSync(LOG_PATH);
}

// discord client events
client.on(Events.ClientReady, (readyClient) => {
  console.log(`Started Discord client as user ${readyClient.user.tag}`);
});
client.on(Events.MessageCreate, async (message) => {
  const pathToTerraform = process.env.TERRAFORM_DIRECTORY || "/terraform";
  if (pathToTerraform) {
    const isActiveTfPlan = fs.existsSync(path.join(pathToTerraform, "tfplan"));

    if (isActiveTfPlan) {
      if (
        message.channelId === process.env.DISCORD_CHANNEL_ID &&
        !message.author.bot
      ) {
        if (message.content.toLowerCase().includes("yes")) {
          const sentMessage = await message.channel.send(
            "Ok, applying changes.."
          );

          exec(
            `/usr/bin/terraform -chdir="${pathToTerraform}" apply -auto-approve`,
            (err, stderr, stdout) => {
              const arr = stderr.split("\n");

              if (
                arr[arr.length - 2].toLowerCase().includes("apply complete!")
              ) {
                sentMessage.edit("**Applied!**");
              } else {
                sentMessage.edit("**Failed to apply!**");
              }
              fs.rmSync(path.join(pathToTerraform, "tfplan"));
            }
          );
        } else if (message.content.toLowerCase().includes("no")) {
          message.channel.send("Ok, not applying changes");
          fs.rmSync(path.join(pathToTerraform, "tfplan"));
        }
      }
    }
  }
});

// temp log file endpoint
app.get("/log/:name", (req: Request, res: Response) => {
  try {
    if (fs.existsSync(path.join(LOG_PATH, req.params.name))) {
      res.sendFile(path.join(LOG_PATH, req.params.name));

      setTimeout(() => {
        fs.rmSync(path.join(LOG_PATH, req.params.name));
      }, 3000);
    } else {
      res.status(404).json({
        status: 404,
        message: "No log with that name found",
      });
    }
  } catch (e) {
    res.status(500).json({
      status: 500,
      message: "Failed to get temp log file",
    });
  }
});

// webhook endpoint
app.post("/webhook", verifyAuth, (req: Request, res: Response) => {
  try {
    const channelToSendTo = process.env.DISCORD_CHANNEL_ID
      ? client.channels.cache.get(process.env.DISCORD_CHANNEL_ID)
      : null;
    const pathToTerraform = process.env.TERRAFORM_DIRECTORY || "/terraform";

    if (pathToTerraform && fs.existsSync(pathToTerraform) && channelToSendTo) {
      // run init separately
      exec(
        `/usr/bin/terraform -chdir="${pathToTerraform}" init`,
        (err, stdout, stderr) => {
          if (err || stderr) {
            console.error("Error during init!", err, stderr);
          } else {
            exec(
              `/usr/bin/terraform -chdir="${pathToTerraform}" plan -no-color -out="${pathToTerraform}/tfplan"`,
              (err, stdout, stderr) => {
                if (stderr) {
                  console.error(stderr);
                } else if (err) {
                  console.error(err);
                }

                if (stderr || err) {
                  console.log("error detected, notifying");

                  const message = `**Terraform failed in planning**\n\n\`\`\`${
                    stderr || err
                  }\`\`\`\n\n`;

                  if (channelToSendTo.isSendable()) {
                    channelToSendTo.send(message);
                  }
                } else {
                  let message = `**Terraform wants to apply these changes**\n\`\`\`${stdout}\`\`\`\n\nDo you want to apply? (yes/no)`;
                  let currentTimestamp = new Date().getTime();

                  if (message.length > 4000) {
                    fs.writeFileSync(
                      path.join(LOG_PATH, `${currentTimestamp}.txt`),
                      stdout,
                      "utf-8"
                    );

                    message = `**Terraform wants to apply these changes**\n\nContent too long for Discord, see [here](${process.env.BASE_URL}/log/${currentTimestamp}.txt)\n\nDo you want to apply? (yes/no)`;
                  }

                  if (channelToSendTo.isSendable()) {
                    channelToSendTo.send(message);
                  }
                }
              }
            );
          }
        }
      );
    } else {
      let message;

      if (!pathToTerraform) message = "Terraform directory was not defined";
      if (pathToTerraform && !fs.existsSync(pathToTerraform))
        message = "Terraform directory does not exist";
      if (!process.env.DISCORD_CHANNEL_ID)
        message = "Discord channel not defined";
      if (!channelToSendTo) message = "Could not find Discord channel";

      res.status(500).json({
        status: 500,
        message,
      });
    }

    res.status(200).json({
      status: 200,
    });
  } catch (e) {
    console.error("Error while receiving webhook request", e);
    res.status(500).json({
      status: 500,
    });
  }
});

function verifyAuth(req: Request, res: Response, next: NextFunction) {
  const queryToken = req.query.token;
  const processToken = process.env.DEPLOY_TOKEN;

  if (queryToken === processToken) {
    next();
  } else {
    res.status(401).json({
      status: 401,
    });
  }
}

// start Discord client
if (process.env.DISCORD_TOKEN && process.env.DEPLOY_TOKEN) {
  app.listen(3000, () => {
    console.log("[Express] Started web server");
    client.login(process.env.DISCORD_TOKEN);
  });
} else {
  throw new Error(
    "No Discord application token or deploy token provided! See documentation"
  );
}
