const state = require("./state.js");

const { Client, ChannelType } = require("discord.js");

const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");

const bidirectionalMap = (capacity, data = {}) => {
    if (!data) data = {};

    const keys = Object.keys(data);

    return new Proxy(data, {
        set(target, prop, newVal) {
            if (typeof prop !== "string" || typeof newVal !== "string") return false;

            keys.push(prop, newVal);

            if (keys.length > capacity) {
                delete target[keys.shift()];
                delete target[keys.shift()];
            }

            target[prop] = newVal;
            target[newVal] = prop;
            return true;
        },
    });
};

const storage = {
    _storageDir: "./storage/",
    async upsert(name, data) {
        if (!fsSync.existsSync(this._storageDir)) {
            await fs.mkdir(this._storageDir, { recursive: true });
        }

        await fs.writeFile(path.join(this._storageDir, name), data);
    },

    async get(name) {
        return fs.readFile(path.join(this._storageDir, name)).catch(() => null);
    },

    _settingsName: "settings",
    async parseSettings() {
        const result = await this.get(this._settingsName);
        if (result === null) {
            return setup.firstRun();
        }

        try {
            const settings = Object.assign(state.settings, JSON.parse(result));
            if (!settings.Token) return setup.firstRun();
            return settings;
        } catch (err) {
            return setup.firstRun();
        }
    },

    _chatsName: "chats",
    async parseChats() {
        const result = await this.get(this._chatsName);
        return result ? JSON.parse(result) : {};
    },

    _contactsName: "contacts",
    async parseContacts() {
        const result = await this.get(this._contactsName);
        return result ? JSON.parse(result) : {};
    },

    _lastMessagesName: "lastMessages",
    async parseLastMessages() {
        const result = await this.get(this._lastMessagesName);
        return result ? bidirectionalMap(state.settings.lastMessageStorage * 2, JSON.parse(result)) : bidirectionalMap(state.settings.lastMessageStorage * 2);
    },

    async save() {
        for await (const field of [this._settingsName, this._chatsName, this._contactsName, this._lastMessagesName]) {
            await this.upsert(field, JSON.stringify(state[field]));
        }
    },
};

const setup = {
    async setupDiscordChannels(token) {
        return new Promise((resolve) => {
            const client = new Client({ intents: ["Guilds"] });

            if (process.env.DISCORD_GUILD_ID) {
                client.once("guildAvailable", async (guild) => {
                    resolve(await this.setControlChannel(client, guild));
                });
            } else {
                client.once("ready", () => {
                    console.log(`Invite the bot using the following link: https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=536879120`);
                });

                client.once("guildCreate", async (guild) => {
                    resolve(await this.setControlChannel(client, guild));
                });
            }

            client.login(token);
        });
    },

    /**
     * @param {Client} client
     * @param {import("discord.js").Guild} guild
     */
    async setControlChannel(client, guild) {
        const category = await guild.channels.create({
            name: "Whatsapp",
            type: ChannelType.GuildCategory,
        });

        const controlChannel = await guild.channels.create({
            name: "control",
            type: ChannelType.GuildText,
            parent: category,
        });

        client.destroy();

        return {
            GuildID: guild.id,
            Categories: [category.id],
            ControlChannelID: controlChannel.id,
        };
    },

    async firstRun() {
        const settings = state.settings;
        console.log("It seems like this is your first run.");

        settings.Token = process.env.DISCORD_BOT_TOKEN;

        if (!settings.Token) {
            console.log("Please provide a Discord bot token.");
            process.exit();
        }

        Object.assign(settings, await this.setupDiscordChannels(settings.Token));

        return settings;
    },
};

module.exports = storage;
