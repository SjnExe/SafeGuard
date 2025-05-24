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
        //TODO: see if setting up logs works. Make sure to add a limit to how much logs can be displayed

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

        world.setDynamicProperty("ac:scriptSetupComplete", true); // Set script setup flag
        logDebug("[Anti Cheats] Initialized and script setup marked as complete.");
        world.acInitialized = true; // General initialization flag
    })
}