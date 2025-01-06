const discordHandler = require("./discordHandler.js");
const state = require("./state.js");
const storage = require("./storage.js");
const utils = require("./utils.js");
const whatsappHandler = require("./whatsappHandler.js");

(async () => {
    const version = "v0.10.28";
    let autoSaver = setInterval(() => storage.save(), 5 * 60 * 1000);

    ["SIGINT", "uncaughtException", "SIGTERM"].forEach((eventName) =>
        process.on(eventName, async (err) => {
            clearInterval(autoSaver);
            console.error(err);
            console.info("Exiting!");
            if (["SIGINT", "SIGTERM"].includes(err)) {
                await storage.save();
            }
            process.exit();
        })
    );

    console.info("Starting");

    await utils.updater.run(version);
    console.info("Update checked.");

    const conversion = await utils.sqliteToJson.convert();
    if (!conversion) {
        console.error("Conversion failed!");
        process.exit(1);
    }
    console.info("Conversion completed.");

    state.settings = await storage.parseSettings();
    console.info("Loaded settings.");

    clearInterval(autoSaver);
    autoSaver = setInterval(() => storage.save(), state.settings.autoSaveInterval * 1000);
    console.info("Changed auto save interval.");

    state.contacts = await storage.parseContacts();
    console.info("Loaded contacts.");

    state.chats = await storage.parseChats();
    console.info("Loaded chats.");

    state.lastMessages = await storage.parseLastMessages();
    console.info("Loaded last messages.");

    state.dcClient = await discordHandler.start();
    console.info("Discord client started.");

    await utils.discord.repairChannels();
    console.info("Repaired channels.");

    await whatsappHandler.start();
    console.info("WhatsApp client started.");

    console.log("Bot is now running. Press CTRL-C to exit.");
})();
