import { EmbedBuilder, WebhookClient, bold, roleMention } from "discord.js";

const client = new WebhookClient({
  id: process.env.WEBHOOK_ID,
  token: process.env.WEBHOOK_TOKEN,
  url: process.env.WEBHOOK_URL,
});

export default async function postWebhook(
  action: string,
  message: string,
  mention: boolean = true
) {
  const embed = new EmbedBuilder();
  embed.setColor("DarkPurple");
  embed.setTitle(action);
  embed.setDescription(bold(message));
  embed.setTimestamp();

  const mentions = [];
  for (const role of process.env.ROLES.split(", ")) {
    mentions.push(roleMention(role));
  }

  return client.send({
    content: mention ? mentions.join(" ") : undefined,
    embeds: [embed],
  });
}
