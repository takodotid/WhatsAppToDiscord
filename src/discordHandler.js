const commandsHandler = require("./commands.js");
const state = require("./state.js");
const utils = require("./utils.js");

const { ApplicationCommandOptionType } = require("discord-api-types/v10");
const { Client } = require("discord.js");

const client = new Client({
    intents: ["Guilds", "GuildMessages", "GuildMessageReactions", "MessageContent"],
});

const commands = commandsHandler(state, utils);

client.on("channelDelete", async (channel) => {
    const jid = utils.discord.channelIdToJid(channel.id);
    delete state.chats[jid];
    delete state.goccRuns[jid];
    state.settings.Categories = state.settings.Categories.filter((id) => channel.id !== id);
});

client.on("whatsappMessage", async (message) => {
    if (((state.settings.oneWay >> 0) & 1) === 0) {
        return;
    }

    let msgContent = "";
    const files = [];
    const webhook = await utils.discord.getOrCreateChannel(message.channelJid);

    if (message.isGroup && state.settings.WAGroupPrefix) {
        msgContent += `[${message.name}] `;
    }

    if (message.isForwarded) {
        msgContent += `forwarded message:\n${message.content.split("\n").join("\n> ")}`;
    } else if (message.quote) {
        msgContent += `> ${message.quote.name}: ${message.quote.content.split("\n").join("\n> ")}\n${message.content}`;
    } else if (message.isEdit) {
        msgContent += `Edited message:\n${message.content}`;
    } else {
        msgContent += message.content;
    }

    if (message.file) {
        if (message.file.largeFile && state.settings.LocalDownloads) {
            msgContent += await utils.discord.downloadLargeFile(message.file);
        } else if (message.file === -1 && !state.settings.LocalDownloads) {
            msgContent += "WA2DC Attention: Received a file, but it's over 8MB. Check WhatsApp on your phone or enable local downloads.";
        } else {
            files.push(message.file);
        }
    }

    if (msgContent || files.length) {
        const parsedMsgContent = utils.discord.partitionText(msgContent);

        while (msgContent.length > 1) {
            // eslint-disable-next-line no-await-in-loop
            await utils.discord.safeWebhookSend(
                webhook,
                {
                    content: parsedMsgContent.shift(),
                    username: message.name,
                    avatarURL: message.profilePic,
                },
                message.channelJid
            );
        }

        const dcMessage = await utils.discord.safeWebhookSend(
            webhook,
            {
                content: parsedMsgContent.shift() || null,
                username: message.name,
                files,
                avatarURL: message.profilePic,
            },
            message.channelJid
        );

        if (dcMessage.channel.type === "GUILD_NEWS" && state.settings.Publish) {
            await dcMessage.crosspost();
        }

        if (message.id !== null) state.lastMessages[dcMessage.id] = message.id;
    }
});

client.on("whatsappReaction", async (reaction) => {
    if (((state.settings.oneWay >> 0) & 1) === 0) {
        return;
    }

    const channelId = state.chats[reaction.jid]?.channelId;
    const messageId = state.lastMessages[reaction.id];
    if (channelId === null || messageId === null) {
        return;
    }

    /** @type {import("discord.js").TextChannel} */
    // @ts-ignore
    const channel = await utils.discord.getChannel(channelId);
    const message = await channel.messages.fetch(messageId);
    await message.react(reaction.text).catch(async (err) => {
        if (err.code === 10014) {
            await channel.send(`Unknown emoji reaction (${reaction.text}) received. Check WhatsApp app to see it.`);
        }
    });
});

client.on("whatsappCall", async ({ call, jid }) => {
    if (((state.settings.oneWay >> 0) & 1) === 0) {
        return;
    }

    const webhook = await utils.discord.getOrCreateChannel(jid);

    const name = utils.whatsapp.jidToName(jid);
    const callType = call.isVideo ? "video" : "voice";
    let content = "";

    switch (call.status) {
        case "offer":
            content = `${name} is ${callType} calling you! Check your phone to respond.`;
            break;
        case "timeout":
            content = `Missed a ${callType} call from ${name}!`;
            break;
    }

    if (content !== "") {
        await webhook.send({
            content,
            username: name,
            avatarURL: await utils.whatsapp.getProfilePic(call),
        });
    }
});

client.on("guildAvailable", async (guild) => {
    try {
        for (const commandName of Object.keys(commands)) {
            guild.commands.create({
                name: commandName,
                description: "WA2DC command",
                defaultMemberPermissions: ["Administrator"],
                options: [
                    {
                        name: "args",
                        description: "Arguments for the command",
                        type: ApplicationCommandOptionType.String,
                        required: false,
                    },
                ],
            });
        }
    } catch (error) {
        console.error(error);
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand() || interaction.user.id === client.user.id) {
        return;
    }

    const args = interaction.options.data.map((option) => option.value.toString());

    const command = interaction.commandName.toLowerCase();
    await (commands[command] || commands.unknownCommand)(interaction, args);
});

client.on("messageCreate", async (message) => {
    // console.log(message, state.dcClient.user.id);

    if (message.author === client.user || message.applicationId === client.user.id || (message.webhookId !== null && !state.settings.redirectWebhooks)) {
        return;
    }

    const jid = utils.discord.channelIdToJid(message.channel.id);

    if (!jid) return;

    state.waClient.ev.emit("discordMessage", { jid, message });
});

client.on("messageUpdate", async (_, message) => {
    if (message.webhookId !== null) {
        return;
    }

    const jid = utils.discord.channelIdToJid(message.channelId);
    if (jid === null) {
        return;
    }

    const messageId = state.lastMessages[message.id];
    if (messageId === null) {
        await message.channel.send("Couldn't edit the message. You can only edit the last 500 messages.");
        return;
    }

    state.waClient.ev.emit("discordEdit", { jid, message });
});

client.on("messageReactionAdd", async (reaction, user) => {
    const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
    if (jid === null) {
        return;
    }
    const messageId = state.lastMessages[reaction.message.id];
    if (messageId === null) {
        await reaction.message.reply("Couldn't send the reaction. You can only react to last 500 messages.");
        return;
    }
    if (user.id === state.dcClient.user.id) {
        return;
    }

    state.waClient.ev.emit("discordReaction", { jid, reaction, removed: false });
});

client.on("messageReactionRemove", async (reaction, user) => {
    const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
    if (jid === null) {
        return;
    }
    const messageId = state.lastMessages[reaction.message.id];
    if (messageId === null) {
        await reaction.message.reply("Couldn't remove the reaction. You can only react to last 500 messages.");
        return;
    }
    if (user.id === state.dcClient.user.id) {
        return;
    }

    state.waClient.ev.emit("discordReaction", { jid, reaction, removed: true });
});

module.exports = {
    start: async () => {
        await client.login(state.settings.Token);
        return client;
    },
};
