# terraform-discord

This is a simple script that runs both an Express server for receiving webhook requests that generate Terraform project plans & a Discord bot to relay them to the user.

## Setup

You'll need to

- have a Node.js installation ready
- have an existing CI/CD pipeline that deploys Terraform (ie. with Ansible)
- be able to configure it to send a webhook POST request w/ a secret to the server

To get started, clone this repository. Copy the example .env file to .env

```
cp .env.example .env
```

and modify it to the values you require. As a rundown to what these are;

- `DEPLOY_TOKEN`; the token sent from your CI/CD pipeline to authenticate the request
- `DISCORD_TOKEN`; the token to your bot application used. You can create one in [Discord's developer hub](https://discord.com/developers/apps)
- `DISCORD_CHANNEL_ID`; the ID of the channel you want plans to be sent to.
- `TERRAFORM_DIRECTORY`; the path that contains the `main.tf` file you want to plan around.
- `BASE_URL`; URL to the server that the bot uses for logs.

## Running

Install the needed node_modules, build the app & run the dist.

```
npm i
npm run build
npm run start
```

I use PM2 to deploy this so it has access to my system, but feel free to do something that better suites you.

## Utilizing

You can trigger a plan to be made by sending a POST request with the proper token to `/webhook`. The token is provided in query params, ie. `/webhook?token=blahblahblah`.

Once this is done, `terraform plan` is run in your project, and a message is sent to the Discord channel you chose in setup.

## Logs

When the plan is too long for Discord channels (>4000 characters), a log will be generated, accessible through the `/log/[filename].txt` endpoint on the Express server. For security purposes, this log is deleted as soon as you view it & will no longer be accessible.
