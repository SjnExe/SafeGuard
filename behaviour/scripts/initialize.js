import * as Minecraft from '@minecraft/server';
import { logDebug, scoreboardAction } from './assets/util';
import * as config from './config';
import { globalBanList } from './assets/globalBanList.js'; // Added import
const world = Minecraft.world;

export function Initialize(){
    Minecraft.system.run(() => {
        // Ensure scoreboard objectives exist
        const objectives = [
            "ac:gametest_on",
            "ac:vanish",
            "ac:notify",
            "ac:setup_success"
        ];
        objectives.forEach(obj => {
            if (world.scoreboard.getObjective(obj) == undefined) {
                try {
                    world.scoreboard.addObjective(obj, obj); // Use obj as display name too, or customize
                    logDebug(`[Anti Cheats] Created scoreboard objective: ${obj}`);
                } catch (e) {
                    logDebug(`[Anti Cheats] Failed to create scoreboard objective ${obj}:`, e);
                }
            }
        });

        // Initialize Gamerules
        if (world.getDynamicProperty("ac:gamerulesSet") === undefined) {
            try {
                world.gameRules.sendCommandFeedback = false;
                world.gameRules.commandBlockOutput = false;
                world.setDynamicProperty("ac:gamerulesSet", true);
                logDebug("[Anti Cheats] Initialized gamerules (sendCommandFeedback, commandBlockOutput).");
            } catch (e) {
                logDebug("[Anti Cheats] Failed to initialize gamerules:", e);
            }
        }

        // world.worldBorder can be set directly if needed, or managed by other game logic/commands.
        // Example: world.worldBorder = world.getDynamicProperty("ac:worldBorder") ?? 0;
        // For this task, we are removing the specific legacy_WorldBordertoV2() call and related conditional.
        // If worldBorder needs to be initialized from a dynamic property, that logic should be explicit.
        // For now, just ensuring the property is read if it exists.
        const existingWorldBorder = world.getDynamicProperty("ac:worldBorder");
        if (typeof existingWorldBorder === 'number') {
            world.worldBorder = existingWorldBorder;
        }


        if (!world.acUnbanQueue) world.acUnbanQueue = []; // This seems like a runtime variable, not directly from dynamic property string parsing here.
        
        // Check for script setup first, then scoreboard as a fallback.
        world.acIsSetup = world.getDynamicProperty("ac:scriptSetupComplete") === true || 
                                 world.scoreboard.getObjective("ac:setup_success") !== undefined;
        
        try {
            const unbanQueueProperty = world.getDynamicProperty("ac:unbanQueue");
            world.acUnbanQueue = unbanQueueProperty ? JSON.parse(unbanQueueProperty) : [];
        } catch (error) {
            logDebug("[Anti Cheats] Error parsing unbanQueue JSON, defaulting to empty array:", error);
            world.acUnbanQueue = [];
        }
        
        logDebug(`[Anti Cheats] Unban Queue: `, JSON.stringify(world.acUnbanQueue));

        try {
            const deviceBanProperty = world.getDynamicProperty("ac:deviceBan");
            world.acDeviceBan = deviceBanProperty ? JSON.parse(deviceBanProperty) : [];
        } catch (error) {
            logDebug("[Anti Cheats] Error parsing deviceBan JSON, defaulting to empty array:", error);
            world.acDeviceBan = [];
        }
        logDebug(`[Anti Cheats] Device Ban List: `, JSON.stringify(world.acDeviceBan));


        world.acVersion = world.getDynamicProperty("ac:version");
        if(!world.acVersion){
            world.setDynamicProperty("ac:version",config.default.version);
            world.acVersion = config.default.version;
        }

        // Initialize logs
        try {
            const logsProperty = world.getDynamicProperty("ac:logs");
            world.acLogs = logsProperty ? JSON.parse(logsProperty) : [];
        } catch (error) {
            logDebug("[Anti Cheats] Error parsing logs JSON, defaulting to empty array:", error);
            world.acLogs = [];
        }
        /**
         * @function addLog
         * @memberof world
         * @param {string} message - The message to log.
         * @description Adds a log message to the world's acLogs dynamic property.
         * Prepends a timestamp to the message.
         * Limits the log to a maximum number of entries (MAX_LOGS), removing the oldest if the limit is exceeded.
         * Saves the updated log array to the "ac:logs" dynamic property.
         * Logs a warning to the console if saving to dynamic property fails.
         * @example world.addLog("Player logged in.");
         */
        world.addLog = function(message) {
            const MAX_LOGS = 100; // Define the maximum number of logs to keep
            if (world.acLogs.length >= MAX_LOGS) {
                world.acLogs.shift(); // Remove the oldest log
            }
            world.acLogs.push(`[${new Date().toISOString()}] ${message}`);
            try {
                world.setDynamicProperty("ac:logs", JSON.stringify(world.acLogs));
            } catch (error) {
                console.warn("[Anti Cheats] Failed to save logs to dynamic property:", error);
            }
        };
        // Example usage: world.addLog("This is a test log message.");

        const editedConfigString = world.getDynamicProperty("ac:config");
        if(editedConfigString){
            try {
                const editedConfig = JSON.parse(editedConfigString);
                for (const i of Object.keys(editedConfig)) {
                    if (config.default.hasOwnProperty(i)) { // Ensure we only update existing config keys
                        config.default[i] = editedConfig[i];
                    }
                }
                logDebug(`[Anti Cheats] Loaded config from dynamic properties.`);
            } catch (error) {
                logDebug(`[Anti Cheats] Error parsing editedConfig JSON from dynamic property "ac:config":`, error);
                // Proceed with default config if parsing fails
            }
        }

        // Load Global Ban List from globalBanList.js if dynamic property doesn't exist
        if (world.getDynamicProperty("ac:gbanList") === undefined) {
            world.setDynamicProperty("ac:gbanList", JSON.stringify(globalBanList)); // Use the imported globalBanList
            logDebug("[Anti Cheats] Initialized global ban list dynamic property from globalBanList.js seed.");
        }

        /**
         * Owner Initialization Block
         * @description This section handles the initial designation of a world owner.
         * It checks if an owner has already been designated by looking for the "ac:ownerPlayerName" dynamic property.
         * If no owner is set (i.e., "ac:ownerPlayerName" is undefined, typically on the first run of the addon in a world):
         * 1. It logs that no owner was found and sets up a listener for the `playerSpawn` event.
         * 2. When the first player spawns:
         *    a. It performs a double-check to ensure `ac:ownerPlayerName` is still undefined (to prevent race conditions).
         *    b. The spawning player's name (`event.player.name`) is stored in the "ac:ownerPlayerName" dynamic property.
         *    c. A log message confirms the owner designation, and a message is broadcast to all players.
         *    d. The `playerSpawn` event subscription is then immediately unsubscribed to prevent this logic from running for subsequent player spawns.
         * 3. If an owner was already designated (e.g., on subsequent world loads), this is logged, and no further action is taken by this block.
         * This ensures that there is a clear and automatic way to assign the first "owner" role in a new world using this addon.
         */
        // Owner Initialization
        if (world.getDynamicProperty("ac:ownerPlayerName") === undefined) {
            logDebug("[Anti Cheats] No owner found. Setting up listener for first player spawn to designate owner.");
            const playerSpawnSubscription = world.afterEvents.playerSpawn.subscribe((event) => {
                // Double check to prevent race conditions if multiple players join simultaneously on first load
                if (world.getDynamicProperty("ac:ownerPlayerName") === undefined) {
                    const newOwnerName = event.player.name;
                    world.setDynamicProperty("ac:ownerPlayerName", newOwnerName);
                    logDebug(`[Anti Cheats] Player "${newOwnerName}" has been designated as the Owner.`);
                    world.sendMessage(`§r§6[§eAnti Cheats§6]§r §aPlayer §e${newOwnerName}§a has been designated as the Owner of this world.`);
                    
                    // Unsubscribe after setting the owner
                    world.afterEvents.playerSpawn.unsubscribe(playerSpawnSubscription);
                    logDebug("[Anti Cheats] Unsubscribed from playerSpawn event for owner designation.");
                } else {
                    // If owner was set by another nearly simultaneous event, just unsubscribe.
                    world.afterEvents.playerSpawn.unsubscribe(playerSpawnSubscription);
                    logDebug("[Anti Cheats] Owner already designated by a concurrent event. Unsubscribed from playerSpawn event.");
                }
            });
        } else {
            logDebug(`[Anti Cheats] Owner already designated: ${world.getDynamicProperty("ac:ownerPlayerName")}`);
        }

        world.setDynamicProperty("ac:scriptSetupComplete", true); // Set script setup flag
        logDebug("[Anti Cheats] Initialized and script setup marked as complete.");
        world.acInitialized = true; // General initialization flag
    })
}