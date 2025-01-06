const { AttachmentBuilder } = require("discord.js");
const QRCode = require("qrcode");

/**
 *
 * @param {*} state
 * @param {*} utils
 * @returns {{
 *    [key: string]: (interaction: import("discord.js").CommandInteraction, args: string[]) => Promise<void>;
 * }}
 */
module.exports = (state, utils) => {
    return {
        async ping(interaction) {
            const delay = Date.now() - interaction.createdTimestamp;

            await interaction.reply({
                content: `Pong! ${delay}ms`,
                flags: "Ephemeral",
            });
        },
        async pairwithcode(interaction, args) {
            if (args.length !== 1) {
                await interaction.reply('Please enter your number. Usage: `pairWithCode <number>`. Don\'t use "+" or any other special characters.');
                return;
            }

            const code = await state.waClient.requestPairingCode(args[0]);
            await interaction.reply(`Your pairing code is: ${code}`);
        },
        async start(interaction, args) {
            if (!args.length) {
                await interaction.reply("Please enter a phone number or name. Usage: `start <number with country code or name>`.");
                return;
            }

            // eslint-disable-next-line no-restricted-globals
            const jid = utils.whatsapp.toJid(args.join(" "));

            if (!jid) {
                await interaction.reply(`Couldn't find \`${args.join(" ")}\`.`);
                return;
            }

            await utils.discord.getOrCreateChannel(jid);

            if (state.settings.Whitelist.length) {
                state.settings.Whitelist.push(jid);
            }

            interaction.reply({
                content: `Started a chat with ${utils.whatsapp.jidToName(jid)}!`,
                flags: "Ephemeral",
            });
        },
        async list(interaction, args) {
            let contacts = utils.whatsapp.contacts();

            if (args) {
                contacts = contacts.filter((name) => name.toLowerCase().includes(args.join(" ")));
            }

            const parsedContacts = contacts.sort((a, b) => a.localeCompare(b)).join("\n");

            const message = utils.discord.partitionText(
                parsedContacts.length ? `${parsedContacts}\n\nNot the whole list? You can refresh your contacts by typing \`resync\`` : "No results were found."
            );

            while (message.length !== 0) {
                // eslint-disable-next-line no-await-in-loop
                await interaction.reply(message.shift());
            }
        },
        async addtowhitelist(interaction, args) {
            const channelID = interaction.channelId;
            if (args.length !== 1 || !channelID) {
                await interaction.reply("Please enter a valid channel name. Usage: `addToWhitelist #<target channel>`.");
                return;
            }

            const jid = utils.discord.channelIdToJid(channelID);
            if (!jid) {
                await interaction.reply("Couldn't find a chat with the given channel.");
                return;
            }

            state.settings.Whitelist.push(jid);
            await interaction.reply("Added to the whitelist!");
        },
        async removefromwhitelist(interaction, args) {
            const channelID = interaction.channelId;
            if (args.length !== 1 || !channelID) {
                await interaction.reply("Please enter a valid channel name. Usage: `removeFromWhitelist #<target channel>`.");
                return;
            }

            const jid = utils.discord.channelIdToJid(channelID);
            if (!jid) {
                await interaction.reply("Couldn't find a chat with the given channel.");
                return;
            }

            state.settings.Whitelist = state.settings.Whitelist.filter((el) => el !== jid);
            await interaction.reply("Removed from the whitelist!");
        },
        async listwhitelist(interaction) {
            await interaction.reply(
                state.settings.Whitelist.length ? `\`\`\`${state.settings.Whitelist.map((jid) => utils.whatsapp.jidToName(jid)).join("\n")}\`\`\`` : "Whitelist is empty/inactive."
            );
        },
        async setdcprefix(interaction, args) {
            if (args.length !== 0) {
                const prefix = args.join(" ");
                state.settings.DiscordPrefixText = prefix;
                await interaction.reply(`Discord prefix is set to ${prefix}!`);
            } else {
                state.settings.DiscordPrefixText = null;
                await interaction.reply("Discord prefix is set to your discord username!");
            }
        },
        async enabledcprefix(interaction) {
            state.settings.DiscordPrefix = true;
            await interaction.reply("Discord username prefix enabled!");
        },
        async disabledcprefix(interaction) {
            state.settings.DiscordPrefix = false;
            await interaction.reply("Discord username prefix disabled!");
        },
        async enablewaprefix(interaction) {
            state.settings.WAGroupPrefix = true;
            await interaction.reply("WhatsApp name prefix enabled!");
        },
        async disablewaprefix(interaction) {
            state.settings.WAGroupPrefix = false;
            await interaction.reply("WhatsApp name prefix disabled!");
        },
        async enablewaupload(interaction) {
            state.settings.UploadAttachments = true;
            await interaction.reply("Enabled uploading files to WhatsApp!");
        },
        async disablewaupload(interaction) {
            state.settings.UploadAttachments = false;
            await interaction.reply("Disabled uploading files to WhatsApp!");
        },
        async help(interaction) {
            await interaction.reply("See all the available commands at https://fklc.github.io/WhatsAppToDiscord/#/commands");
        },
        async resync(interaction) {
            await state.waClient.authState.keys.set({
                "app-state-sync-version": { critical_unblock_low: null },
            });
            await state.waClient.resyncAppState(["critical_unblock_low"]);
            for (const [jid, attributes] of Object.entries(await state.waClient.groupFetchAllParticipating())) {
                state.waClient.contacts[jid] = attributes.subject;
            }
            await utils.discord.renameChannels();
            await interaction.reply("Re-synced!");
        },
        async enablelocaldownloads(interaction) {
            state.settings.LocalDownloads = true;
            await interaction.reply(`Enabled local downloads. You can now download files larger than 8MB.`);
        },
        async disablelocaldownloads(interaction) {
            state.settings.LocalDownloads = false;
            await interaction.reply(`Disabled local downloads. You won't be able to download files larger than 8MB.`);
        },
        async getdownloadmessage(interaction) {
            await interaction.reply(`Download message format is set to "${state.settings.LocalDownloadMessage}"`);
        },
        async setdownloadmessage(interaction, args) {
            state.settings.LocalDownloadMessage = args.join(" ");
            await interaction.reply(`Set download message format to "${state.settings.LocalDownloadMessage}"`);
        },
        async getdownloaddir(interaction) {
            await interaction.reply(`Download path is set to "${state.settings.DownloadDir}"`);
        },
        async setdownloaddir(interaction, args) {
            state.settings.DownloadDir = args.join(" ");
            await interaction.reply(`Set download path to "${state.settings.DownloadDir}"`);
        },
        async enablepublishing(interaction) {
            state.settings.Publish = true;
            await interaction.reply(`Enabled publishing messages sent to news channels.`);
        },
        async disablepublishing(interaction) {
            state.settings.Publish = false;
            await interaction.reply(`Disabled publishing messages sent to news channels.`);
        },
        async enablechangenotifications(interaction) {
            state.settings.ChangeNotifications = true;
            await interaction.reply(`Enabled profile picture change and status update notifications.`);
        },
        async disablechangenotifications(interaction) {
            state.settings.ChangeNotifications = false;
            await interaction.reply(`Disabled profile picture change and status update notifications.`);
        },
        async autosaveinterval(interaction, args) {
            if (args.length !== 1) {
                await interaction.reply("Usage: autoSaveInterval <seconds>\nExample: autoSaveInterval 60");
                return;
            }
            state.settings.autoSaveInterval = +args[0];
            await interaction.reply(`Changed auto save interval to ${args[0]}.`);
        },
        async lastmessagestorage(interaction, args) {
            if (args.length !== 1) {
                await interaction.reply("Usage: lastMessageStorage <size>\nExample: lastMessageStorage 1000");
                return;
            }
            state.settings.lastMessageStorage = +args[0];
            await interaction.reply(`Changed last message storage size to ${args[0]}.`);
        },
        async oneway(interaction, args) {
            if (args.length !== 1) {
                await interaction.reply("Usage: oneWay <discord|whatsapp|disabled>\nExample: oneWay whatsapp");
                return;
            }

            if (args[0] === "disabled") {
                state.settings.oneWay = 0b11;
                await interaction.reply(`Two way communication is enabled.`);
            } else if (args[0] === "whatsapp") {
                state.settings.oneWay = 0b10;
                await interaction.reply(`Messages will be only sent to WhatsApp.`);
            } else if (args[0] === "discord") {
                state.settings.oneWay = 0b01;
                await interaction.reply(`Messages will be only sent to Discord.`);
            } else {
                await interaction.reply("Usage: oneWay <discord|whatsapp|disabled>\nExample: oneWay whatsapp");
            }
        },
        async redirectwebhooks(interaction, args) {
            if (args.length !== 1) {
                await interaction.reply("Usage: redirectWebhooks <yes|no>\nExample: redirectWebhooks yes");
                return;
            }

            state.settings.redirectWebhooks = args[0] === "yes";
            await interaction.reply(`Redirecting webhooks is set to ${state.settings.redirectWebhooks}.`);
        },
        async connectwhatsapp(interaction) {
            const reply = await interaction.deferReply({ flags: "Ephemeral" });

            const checkInterval = setInterval(async () => {
                if (state.connectionQR) {
                    reply.edit({
                        content: "Scan the QR code to connect to WhatsApp.",
                        files: [
                            new AttachmentBuilder(await QRCode.toBuffer(state.connectionQR), {
                                name: "qrcode.png",
                            }),
                        ],
                    });
                } else {
                    reply.edit("Connected to WhatsApp!");
                    clearInterval(checkInterval);
                }
            }, 1000);

            setTimeout(() => {
                clearInterval(checkInterval);
                reply.edit("Connection timed out. Please try again.");
            }, 30 * 1000); // Max 30 seconds
        },
    };
};
