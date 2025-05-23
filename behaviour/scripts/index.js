import * as Minecraft from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';


import * as config from "./config.js";
import * as ui from "./assets/ui.js";
import { formatMilliseconds, teleportToGround, sendMessageToAllAdmins, parsePunishmentTime, sendAnticheatAlert, logDebug } from "./assets/util.js";
import { globalBanList as seedGlobalBanList } from './assets/globalBanList.js'; // Renamed import
import { commandHandler } from './command/handle.js';
import "./command/importer.js";
import "./slash_commands.js";
import { ACModule } from './classes/module.js';
import { Vector3utils } from './classes/vector3.js';

import "./classes/player.js"; // This is the import to verify later
import { Initialize } from './initialize.js';
import { initializeReachCheck } from './modules/reach_check.js';
import { initializeNoSwingCheck } from './modules/noswing_check.js'; // New import

logDebug("[Anti Cheats] Script Loaded");

const world = Minecraft.world;

const gamertagRegex = /[^A-Za-z 0-9-]/gm;

// --- JSDoc for handleMute, handleAntiSpam, formatChatMessageWithRank, and the main chatSend subscriber ---

/**
 * Handles mute status for a player trying to send a chat message.
 * If the player is actively muted, it sends them a message with mute details and cancels the chat event.
 * It also corrects the `player.isMuted` state if a stored mute is found to be no longer active.
 *
 * @param {Minecraft.Player} player The player who sent the chat message.
 * @param {Minecraft.ChatSendBeforeEvent} data The `beforeChatSend` event data, used to cancel the message.
 * @returns {boolean} Returns `true` if the message was cancelled due to an active mute, `false` otherwise.
 */
function handleMute(player, data) {
	if (player.isMuted) {
		const muteInfo = player.getMuteInfo(); // Assumes getMuteInfo is robust
		if (!muteInfo.isActive) {
			player.isMuted = false; // Correct the state if mute expired
		} else {
			player.sendMessage(`§6[§eAnti Cheats§6]§4 You were muted by §c${muteInfo.admin}§4 Time remaining: §c${muteInfo.isPermanent ? "permanent" : formatMilliseconds(muteInfo.duration - Date.now())} §4reason: §c${muteInfo.reason}`);
			data.cancel = true;
			return true;
		}
	}
	return false;
}

/**
 * Handles anti-spam checks for a player's chat message.
 * This function checks for various spam conditions:
 * - Extremely long messages (potential packet exploit).
 * - Repetitive messages.
 * - Messages sent too quickly in succession.
 * - Messages exceeding configured character or word limits.
 * It applies different rules for admins (who bypass these checks) and for messages starting with whitelisted prefixes (e.g., commands),
 * which have more lenient spam timing.
 * If a spam condition is met, the chat event (`data`) is cancelled, and the player is notified.
 * Player's `lastMessage` and `lastMessageDate` properties are updated if the message passes checks.
 *
 * @param {Minecraft.Player} player The player who sent the message.
 * @param {string} message The content of the chat message.
 * @param {Minecraft.ChatSendBeforeEvent} data The `beforeChatSend` event data, used to cancel the message.
 * @param {boolean} isAdmin Indicates if the player has admin privileges (to bypass spam checks).
 * @returns {boolean} Returns `true` if the message was cancelled due to spam, `false` otherwise.
 */
function handleAntiSpam(player, message, data, isAdmin) {
	const antiSpamModuleActive = ACModule.getModuleStatus(ACModule.Modules.spammerProtection);
	if (isAdmin || !antiSpamModuleActive) {
		return false;
	}

	const now = Date.now();
	const spamConfig = config.default.chat.spammer;

	// Invalid packet length (extreme case)
	if (message.length > 512) {
		data.cancel = true;
		player.ban("Sending invalid packet (length > 512)", Date.now(), true, "Anti Cheats AntiCheat");
		Minecraft.system.run(() => {
			player.runCommand(`kick @s §6[§eAnti Cheats§6]§r You have been permanently banned for sending invalid packet.`);
		});
		sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§c ${player.name}§4 was automatically banned for sending an invalid text packet (length=${message.length})`, true);
		return true;
	}

	// Check against whitelisted prefixes first
	let isWhitelisted = false;
	for (const wPrefix of spamConfig.whitelistedPrefixes) {
		if (message.startsWith(wPrefix)) {
			isWhitelisted = true;
			break;
		}
	}

	if (isWhitelisted) {
		// Even whitelisted messages (like commands) should update last message date to prevent command spam
		// but not content for duplicate check if it's a command with varying args.
		// For simplicity, we'll update lastMessageDate, but not lastMessage content for whitelisted.
		// This allows different commands rapidly, but not the *exact same* command.
		// A more nuanced approach might be needed if exact same commands are to be allowed rapidly.
		if (message === player.lastMessage && (now - player.lastMessageDate <= spamConfig.minTime)) {
             player.lastMessageDate = now; // Still update time to penalize exact same command rapidly
			data.cancel = true;
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c Please don't send repeating messages!`);
			return true;
        }
        // For whitelisted prefixes (usually commands), we don't check content length or word limit.
        // We do update lastMessageDate to prevent extremely rapid command execution.
        if (now - player.lastMessageDate <= spamConfig.minTime / 2 ) { // Allow commands a bit faster
            data.cancel = true;
			player.lastMessageDate = now; // Update time to penalize
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c You're sending commands too quickly!`);
			return true;
        }

	} else {
		// Regular spam checks for non-whitelisted messages
		if (message === player.lastMessage) {
			data.cancel = true;
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c Please don't send repeating messages!`);
			return true;
		}
		if (now - player.lastMessageDate <= spamConfig.minTime) {
			data.cancel = true;
			player.lastMessageDate = now; // Update time to penalize
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c You're sending messages too quickly!`);
			return true;
		}
		if (message.length > spamConfig.maxMessageCharLimit) {
			data.cancel = true;
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c Sorry! Your message has too many characters!`);
			return true;
		}
		if (message.split(" ").length > spamConfig.maxMessageWordLimit) {
			data.cancel = true;
			player.sendMessage(`§6[§eAnti Cheats§6]§r§c Please keep your message below ${spamConfig.maxMessageWordLimit} words!`);
			return true;
		}
	}

    // If message passes all relevant checks, update last message info
    // For whitelisted (commands), only update if it's different from the last one to allow some repetition of different commands.
    // For non-whitelisted, always update.
    if (!isWhitelisted || message !== player.lastMessage) {
        player.lastMessage = message;
    }
    player.lastMessageDate = now;

	return false; // Message not cancelled by spam checks
}

/**
 * Formats a chat message with the player's rank information (prefix, name color, message color).
 * Retrieves the player's rank ID from a dynamic property (`ac:rankId`) or uses the default rank.
 * Looks up rank details from `config.default.ranks`.
 *
 * @param {Minecraft.Player} player The player whose message is being formatted.
 * @param {string} message The original chat message content.
 * @returns {string|null} The formatted chat message string if rank information is found and applied.
 *                        Returns `null` if the rank ID does not correspond to a defined rank in the configuration,
 *                        implying the original message should be sent or handled differently.
 */
function formatChatMessageWithRank(player, message) {
	const playerRankId = player.getDynamicProperty("ac:rankId") || config.default.defaultRank;
	const rankIdStr = typeof playerRankId === 'string' ? playerRankId : config.default.defaultRank;
	const rankInfo = config.default.ranks[rankIdStr];

	if (rankInfo) {
		return `${rankInfo.displayText} ${rankInfo.nameColor}${player.name}§r: ${rankInfo.messageColor}${message}`;
	}
	return null;
}

/**
 * Subscribes to the `world.beforeEvents.chatSend` event to intercept and process chat messages.
 * This is a central handler for chat-related functionalities:
 * 1.  **Mute Handling**: Checks if the sender is muted; if so, cancels the message and notifies the player. (via `handleMute`)
 * 2.  **Anti-Spam**: Applies various spam detection rules (message length, speed, repetition, content limits)
 *     and cancels the message if spam is detected. Admin players bypass these checks.
 *     Updates player's last message details for spam tracking. (via `handleAntiSpam`)
 * 3.  **Command Processing**: If the message starts with the configured command prefix (`config.default.chat.prefix`),
 *     it cancels the original chat message and forwards the event data to the `commandHandler`
 *     for execution, run asynchronously via `Minecraft.system.run()`.
 * 4.  **Rank Formatting**: For regular chat messages (not commands), it formats the message
 *     by prepending the player's rank display text and applying rank-specific colors for
 *     the name and message content. The original message is cancelled, and the formatted
 *     version is broadcast using `world.sendMessage()`. (via `formatChatMessageWithRank`)
 *
 * It includes comprehensive error handling to prevent crashes and notify players or log issues.
 * The order of operations ensures that mutes and spam are checked first, then commands, and finally rank formatting for public chat.
 */
world.beforeEvents.chatSend.subscribe((data) => {
	try {
		const { sender: player, message } = data;
		const isAdmin = player.hasAdmin();
		const commandPrefix = config.default.chat.prefix;

		// 1. Handle Mute Status
		if (handleMute(player, data)) {
			return;
		}

		// 2. Handle Anti-Spam (also updates player.lastMessage and player.lastMessageDate internally)
		// Note: Whitelisted prefixes (like commands) have different spam rules inside handleAntiSpam.
		if (handleAntiSpam(player, message, data, isAdmin)) {
			return;
		}

		// 3. Handle Command Processing
		if (message.startsWith(commandPrefix)) {
			data.cancel = true;
			Minecraft.system.run(() => {
				try {
					commandHandler(data); // commandHandler should ideally have its own try-catch for its specific logic
				} catch (e) {
					logDebug("[Anti Cheats ERROR] Error executing commandHandler via system.run:", e, e.stack);
					if (player instanceof Minecraft.Player) { // Ensure player is still valid
						player.sendMessage("§cAn error occurred while processing your command.");
					}
				}
			});
			return;
		}

		// 4. Handle Rank Formatting for regular chat messages
		const formattedMessage = formatChatMessageWithRank(player, message);
		if (formattedMessage) {
			data.cancel = true;
			world.sendMessage(formattedMessage);
		} else {
			// If rank formatting returns null (e.g., rank not found), the original message is allowed to send.
			// This matches the original logic where if rankInfo was not found, the message was not cancelled by that part.
			// If the desired behavior is to *always* cancel if formatting fails, then `data.cancel = true;` would be needed here too.
			// For now, replicating original behavior.
		}
		// No explicit return here, if formattedMessage is null, original message data (possibly uncancelled) proceeds.
		// If it *was* formatted, it's sent and original is cancelled.

	} catch (e) {
		logDebug("[Anti Cheats ERROR] General error in chatSend event subscriber:", e, e.stack);
		if (data && data.sender instanceof Minecraft.Player) {
			try {
				data.sender.sendMessage("§cAn error occurred processing your chat message.");
				data.cancel = true; // Ensure cancellation on general error
			} catch (sendMessageError) {
				logDebug("[Anti Cheats ERROR] Failed to send error message to player in chatSend catch block:", sendMessageError, sendMessageError.stack);
			}
		} else if (data) {
            // If sender is not a player, or data.sender is undefined, still try to cancel.
            data.cancel = true;
        }
	}
});

world.afterEvents.playerDimensionChange.subscribe((data) => {
	try {
		const {fromLocation,player,dimension: toDimension} = data; // dimension renamed to toDimension

		if (toDimension.id == "minecraft:the_end") {
		if(!ACModule.getModuleStatus(ACModule.Modules.endLock)) return;
		if(player.hasAdmin() && config.default.world.endLock.adminsBypass) return;
		
		logDebug(`${player.name} entered the end`);
		player.teleport({...fromLocation,y:325}, { dimension: world.getDimension("overworld"), rotation: { x: 0, y: 0 } });
		player.sendMessage("§6[§eAnti Cheats§6]§r§4 The end was locked by an admin!");
		player.addEffect("slow_falling", 1200, { amplifier: 1, showParticles: false });
	}
	else if (toDimension.id == "minecraft:nether") {
		if (!ACModule.getModuleStatus(ACModule.Modules.netherLock)) return;
		if (player.hasAdmin() && config.default.world.netherLock.adminsBypass) return;

		logDebug(`${player.name} entered the nether`);
		player.teleport({ ...fromLocation, y: 325 }, { dimension: world.getDimension("overworld"), rotation: { x: 0, y: 0 } });
			player.sendMessage("§6[§eAnti Cheats§6]§r§4 The nether was locked by an admin!");
			player.addEffect("slow_falling", 1200, { amplifier: 1, showParticles: false });
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in playerDimensionChange event:", e, e.stack);
		if (data && data.player instanceof Minecraft.Player) {
			try {
				data.player.sendMessage("§cAn error occurred processing your dimension change.");
			} catch (sendMessageError) {
				logDebug("[Anti Cheats ERROR] Failed to send error message to player in playerDimensionChange:", sendMessageError, sendMessageError.stack);
			}
		}
	}
})

world.afterEvents.playerSpawn.subscribe((data) => {
	try {
		const { player, initialSpawn } = data; // initialSpawn from data

		if (!initialSpawn) return; // Use initialSpawn
		try{ // Inner try-catch for Initialize as it's a distinct critical step
			if (!world.acInitialized) Initialize(); // Initialize itself should have robust error handling
		}catch(err){
			logDebug(`[Anti Cheats ERROR] Error during Initialize call in playerSpawn:`, err, err.stack);
			// Potentially send a message to admins or the joining player if critical
		}
		player.currentGamemode = player.getGameMode(); // getGameMode is an API call
		player.isMuted = player.getMuteInfo().isActive; // getMuteInfo now has try-catch
		player.combatLogTimer = null;

		const antiNamespoof = ACModule.getModuleStatus(ACModule.Modules.antiNamespoof);

		if (antiNamespoof && (player.name.length > 16 || gamertagRegex.test(player.name))) {
			player.ban("Namespoof", Date.now(), true, "Anti Cheats AntiCheat"); // ban is wrapped
			player.runCommand(`kick @s §6[§eAnti Cheats§6]§r You have been permanently banned for namespoof.`);
			sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§r ${player.name}§r§4 was automatically banned for namespoof`, true); // sendMessageToAllAdmins is wrapped
			return;
		}
		
		if (!world.acIsSetup && player.hasAdmin()) { // hasAdmin is wrapped // world.safeguardIsSetup -> world.acIsSetup
			player.sendMessage(`§r§6[§eAnti Cheats§6]§r§4 WARNING! §cThe AntiCheat is not setup, some features may not work. Please run §7/function setup/setup§c to setup!`);
		}

		if(world.acVersion !== config.default.version){ // world.safeguardVersion -> world.acVersion
			player.sendMessage(`§r§6[§eAnti Cheats§6]§f Anti Cheats has successfully updated to v${config.default.version}`);
		try {
			world.setDynamicProperty("ac:version",config.default.version); 
		} catch (e) {
			logDebug("[Anti Cheats ERROR] Failed to set version dynamic property in playerSpawn:", player.name, e, e.stack);
		}
		}

	// Fetch and parse the dynamic global ban list
	const dynamicGbanListString = world.getDynamicProperty("ac:gbanList"); // Already handled parsing with try-catch
	let dynamicGbanList = [];
	if (typeof dynamicGbanListString === 'string') { // Ensure it's a string before parsing
		try {
			dynamicGbanList = JSON.parse(dynamicGbanListString);
			if (!Array.isArray(dynamicGbanList)) { // Ensure it's an array
				dynamicGbanList = [];
				logDebug("Dynamic global ban list was not an array, reset to empty.");
			}
		} catch (e) {
			logDebug("Failed to parse dynamic global ban list, resetting to empty:", e);
			dynamicGbanList = []; // Reset to empty array on parse error
			// Optionally, re-initialize from seed if parsing fails and it's considered critical
			// world.setDynamicProperty("ac:gbanList", JSON.stringify(seedGlobalBanList)); 
		}
	}

	// Check against both seed and dynamic global ban lists
	const isBannedInSeed = seedGlobalBanList.some(entry => 
		(typeof entry === 'string' && entry === player.name) || 
		(typeof entry === 'object' && entry.name === player.name)
	);
	const isBannedInDynamic = dynamicGbanList.some(entry => 
		(typeof entry === 'string' && entry === player.name) || 
		(typeof entry === 'object' && entry.name === player.name)
	);

	if (isBannedInSeed || isBannedInDynamic) {
		let kickMessage = `§r§6[§eAnti Cheats§6]§r §4Your name was found in the global ban list.`; // Default

		const dynamicBanEntry = dynamicGbanList.find(entry => typeof entry === 'object' && entry.name === player.name);
		const seedBanEntry = seedGlobalBanList.find(entry => typeof entry === 'object' && entry.name === player.name);
		
		if (dynamicBanEntry && dynamicBanEntry.reason) {
			kickMessage = `§r§6[§eAnti Cheats§6]§r §4You are on the global ban list.\n§4Reason: §c${dynamicBanEntry.reason}\n§4Banned by: §c${dynamicBanEntry.bannedBy || 'Unknown'}`;
		} else if (seedBanEntry && seedBanEntry.reason) { 
			 kickMessage = `§r§6[§eAnti Cheats§6]§r §4You are on the global ban list.\n§4Reason: §c${seedBanEntry.reason}\n§4Banned by: §c${seedBanEntry.bannedBy || 'System'}`;
		}

		player.runCommand(`kick @s ${kickMessage}`);
		return;
	}

	if (world.acUnbanQueue.includes(player.name)){ // world.safeguardUnbanQueue -> world.acUnbanQueue
		if(player.unban()) {
			player.sendMessage("§r§6[§eAnti Cheats§6]§r You were unbanned.");
			logDebug(`[Anti Cheats] Player ${player.name} was unbanned through unban queue`);
		}
		else logDebug(`[Anti Cheats] Unban for ${player.name} failed`);
	}
	
	const banInfo = player.getBan();
	if (banInfo.isBanned) {
		const { unbanTime, isPermanent, bannedBy, reason } = banInfo;
		const timeRemaining = formatMilliseconds(unbanTime - Date.now());
		logDebug(`${player.name} is banned: `, JSON.stringify(banInfo));
		if (isPermanent) return player.runCommand(`kick @s §r§6[§eAnti Cheats§6]§r §4You are permanently banned.\n§4Reason: §c${reason}\n§4Banned by: §c${bannedBy}`);
		else return player.runCommand(`kick @s §r§6[§eAnti Cheats§6]§r §4You are banned.\n§4Time Remaining: §c${timeRemaining}\n§4Reason: §c${reason}\n§4Banned by: §c${bannedBy}`);
	}

	if (world.acDeviceBan.length > 0 && world.acDeviceBan.includes(player.clientSystemInfo.platformType)){ // world.safeguardDeviceBan -> world.acDeviceBan
		sendMessageToAllAdmins(`§6[§eAnti Cheats§6]§4 The player §c${player.name}§4 was kicked for joining on banned device: §c${player.clientSystemInfo.platformType}`);
		player.runCommand(`kick @s §r§6[§eAnti Cheats§6]§r §4Sorry, the administrators have banned the device you are playing on.`);
		return;
	}
	
	const welcomerisOn = ACModule.getModuleStatus(ACModule.Modules.welcomer);
	if (welcomerisOn) {
		const firstTimeWelcome = player.getDynamicProperty("ac:firstTimeWelcome");
		if (!firstTimeWelcome) {
			world.sendMessage(`§6[§eAnti Cheats§6]§r§e ${player.name}§b is joining for the first time! This realm is protected by §eAnti Cheats§b, enjoy your stay!§r`);
			player.setDynamicProperty("ac:firstTimeWelcome", true);
		} else {
			world.sendMessage(`§6[§eAnti Cheats§6]§r§e ${player.name}§b is joining on §e${player.clientSystemInfo.platformType}`);
		}
	}

	const antiCLog = ACModule.getModuleStatus(ACModule.Modules.antiCombatlog);
	const endLockOn = ACModule.getModuleStatus(ACModule.Modules.endLock);
	const netherLock = ACModule.getModuleStatus(ACModule.Modules.netherLock);
	
	if ((endLockOn && player.dimension.id == "minecraft:the_end") && !(player.hasAdmin() && config.default.world.endLock.adminsBypass)) {
		const playerSpawnPoint = player.getSpawnPoint();
		player.teleport({ x: playerSpawnPoint.x, y: playerSpawnPoint.y, z: playerSpawnPoint.z }, { dimension: playerSpawnPoint.dimension, rotation: { x: 0, y: 0 } });
		player.sendMessage("§6[§eAnti Cheats§6]§r§4 The end was locked by an admin!");
	}
	if ((netherLock && player.dimension.id == "minecraft:nether") && !(player.hasAdmin() && config.default.world.netherLock.adminsBypass)) {
		const playerSpawnPoint = player.getSpawnPoint();
		player.teleport({ x: playerSpawnPoint.x, y: playerSpawnPoint.y, z: playerSpawnPoint.z }, { dimension: playerSpawnPoint.dimension, rotation: { x: 0, y: 0 } });
		player.sendMessage("§6[§eAnti Cheats§6]§r§4 The nether was locked by an admin!");
	}

	if ((antiCLog && player.hasTag("ac:isInCombat"))) { // safeguard:isInCombat -> ac:isInCombat
		logDebug(player.name,"joined while in combat")
		player.removeTag("ac:isInCombat"); // safeguard:isInCombat -> ac:isInCombat

		if (player.hasAdmin() && config.default.combat.combatLogging.adminsBypass) player.combatLogTimer = null;
		else {	
			logDebug(`executing clog punishment on ${player.name} (${config.default.combat.combatLogging.punishmentType})`);
			if (config.default.combat.combatLogging.alwaysSendAlert) world.sendMessage(`§r§6[§eAnti Cheats§6]§e ${player.name}§r Was detected combat logging!`);

			switch (config.default.combat.combatLogging.punishmentType) {
				case 0:
					if (!config.default.combat.combatLogging.alwaysSendAlert) world.sendMessage(`§r§6[§eAnti Cheats§6]§e ${player.name}§r Was detected combat logging!`);
					break;
				case 1:
					player.sendMessage(`§r§6[§eAnti Cheats§6]§r You were killed for combat logging`);
					player.kill();
					break;
				case 2:
					player.sendMessage(`§r§6[§eAnti Cheats§6]§r Your inventory was cleared for combat logging`);
					const inv = player.getComponent("inventory").container;
					inv.clearAll();
					break;
				case 3:
					const punishment = config.default.combat.combatLogging.punishmentTime.split(" ");
					const punishmentTime = parsePunishmentTime(punishment);

					if (!punishmentTime) {
						console.warn(`§4[Anti Cheats] Invalid punishment time format in config.`);
						break;
					}

					const now = Date.now();
					const unbanTime = now + punishmentTime;

					player.ban("Combat logging", unbanTime, false, "Anti Cheats AntiCheat");
					player.runCommand(`kick @s §r§6[§eAnti Cheats§6]§r You were temporarily banned for combat logging.`);
					break;
				default:
					console.warn(`§4[Anti Cheats] Unknown punishment type(${config.default.combat.combatLogging.punishmentType}) was entered, no punishment will be given`);
					break;
			}
		}
	}
	const playerFreezeStatus = player.getDynamicProperty("ac:freezeStatus"); 
	if (typeof playerFreezeStatus === "boolean") player.setFreezeTo(playerFreezeStatus); 
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in playerSpawn event for player:", data?.player?.name, e, e.stack);
		if (data && data.player instanceof Minecraft.Player) {
			try {
				data.player.sendMessage("§cAn error occurred during the spawn process. Please notify an admin.");
			} catch (sendMessageError) {
				logDebug("[Anti Cheats ERROR] Failed to send error message to player in playerSpawn:", sendMessageError, sendMessageError.stack);
			}
		}
	}
})

Minecraft.system.runInterval(() => {
	try {
		const invalidVelocityCheckOn = ACModule.getModuleStatus(ACModule.Modules.velocityCheck);
		const players = world.getPlayers(); 
		for (let ii = 0; ii < players.length; ii++) { 
			try {
				const player = players[ii];
				const isAdmin = player.hasAdmin(); 
				player.velocity = player.getVelocity(); 
				player.speed = Vector3utils.magnitude(player.velocity);
				player.hitEntities = [];
				player.blocksBroken = 0;

				betaFeatures(player); 
				if (player.currentCps > 0 && Date.now() - player.initialClick >= 1000) {
					const antiAutoclicker = ACModule.getModuleStatus(ACModule.Modules.cpsCheck);
					if (player.currentCps > config.default.combat.autoclicker.maxCps && antiAutoclicker) {
						player.addEffect("weakness", 40, { amplifier: 255, showParticles: false }); 
						sendAnticheatAlert(player, "autoclicker", player.currentCps, ACModule.Modules.cpsCheck); 
					}
					player.initialClick = 0;
					player.finalCps = player.currentCps;
					player.currentCps = 0;
				}
				if (!player.registerValidCoords) player.registerValidCoords = true;
				
				if (player.combatLogTimer) {
					const now = Date.now();
					if (now - player.combatLogTimer > config.default.combat.combatLogging.timeToStayInCombat) {
						player.combatLogTimer = null;
						player.removeTag("ac:isInCombat"); // safeguard:isInCombat -> ac:isInCombat
						logDebug(player.name, "is longer in combat");
						player.sendMessage(`§r§6[§eAnti Cheats§6]§r You are no longer in combat.`); 
					}
				}

				if (invalidVelocityCheckOn && player.speed > 400) {
					const { velocity } = player;
					sendAnticheatAlert(player, "high velocity", `X:§c${velocity.x.toFixed(2)} §4Y:§c${velocity.y.toFixed(2)}§4 §4Z:§c${velocity.z.toFixed(2)} §4(§c${player.speed.toFixed(3)}§4)`, ACModule.Modules.velocityCheck); 
					player.registerValidCoords = false;
					player.teleport(player.lastValidCoords); 
				}

				if (player.registerValidCoords) player.lastValidCoords = player.location;

				if (world.worldBorder) {
					let { x, y, z } = player.location;
					const border = world.worldBorder;
					if (Math.abs(x) > border || Math.abs(y) > border || Math.abs(z) > border) {
						if (isAdmin && config.default.world.worldborder.adminsBypassBorder) continue; 

						player.sendMessage(`§6[§eAnti Cheats§6]§r You reached the border of §e${border}§f blocks!`); 
						const currentLocation = player.location;
						const offsetX = currentLocation.x >= 0 ? -1 : 1;
						const offsetZ = currentLocation.z >= 0 ? -1 : 1;

						player.tryTeleport({ 
							x: currentLocation.x + offsetX,
							y: currentLocation.y,
							z: currentLocation.z + offsetZ,
						}, {
							checkForBlocks: false,
						});
					}
				}
			} catch (playerError) {
				logDebug("[Anti Cheats ERROR] Error processing player in runInterval (velocity/CPS):", players[ii]?.name, playerError, playerError.stack);
			}
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in runInterval (velocity/CPS):", e, e.stack);
	}
});

world.afterEvents.entityHitEntity.subscribe(async (data) => {
	try {
		const player = data.damagingEntity; 
		const hurtEntity = data.hitEntity; 

		if (!(player instanceof Minecraft.Player)) return;
		const hasWeakness = player.getEffect("weakness"); // API Call

		const antiKillaura = ACModule.getModuleStatus(ACModule.Modules.killauraCheck);

		if (!hasWeakness && !player.hitEntities.includes(hurtEntity.id)) player.hitEntities.push(hurtEntity.id);

		if (player.hitEntities.length > config.default.combat.killaura.maxHitEntities && !player.hasAdmin() && antiKillaura) { // hasAdmin is wrapped
			sendAnticheatAlert(player, "multi killaura", player.hitEntities.length, ACModule.Modules.killauraCheck); // Wrapped
			player.addEffect("weakness", 40, { amplifier: 255, showParticles: false }); // API Call
			player.hitEntities = 0; 
		}
		if (!hasWeakness && player.hitEntities.length <= 1) {
			const now = Date.now();

			if (!player.initialClick || now - player.initialClick >= 1000) player.initialClick = now;

			player.currentCps++;
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in entityHitEntity event:", data?.damagingEntity?.name, e, e.stack);
	}
})

world.afterEvents.entityHurt.subscribe((data) => {
	try {
		const player = data.hurtEntity; 

		if (!(player instanceof Minecraft.Player)) return; // Check if it's a player instance

		const healthComponent = player.getComponent("health"); // API Call
		if (!healthComponent) return; // Component might not exist
		const hp = healthComponent.currentValue;
			
		if(hp <= 0) {
			player.combatLogTimer = null;
			if(player.hasTag("ac:isInCombat")) player.removeTag("ac:isInCombat"); // safeguard:isInCombat -> ac:isInCombat
			
			if (ACModule.getModuleStatus(ACModule.Modules.deathEffect)) player.runCommand("function assets/death_effect"); // API Call
			
			const deathCoordStatus = ACModule.getModuleStatus(ACModule.Modules.deathCoords);
			if(deathCoordStatus){
				const { x, y, z } = player.location;
				player.sendMessage(`§6[§eAnti Cheats§6]§r §eYou died at ${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)} (in ${player.dimension.id.replace("minecraft:","")})`); // API Call
			}
		}

		const antiCombatLogEnabled = ACModule.getModuleStatus(ACModule.Modules.antiCombatlog);
		if (!antiCombatLogEnabled) return;

		if (data.damageSource?.damagingEntity instanceof Minecraft.Player) { // Check if damagingEntity exists and is a player
			const damager = data.damageSource.damagingEntity;

			const adminsBypassCombatLogging = config.default.combat.combatLogging.adminsBypass;
			const now = Date.now();

			if (!player.hasTag("ac:isInCombat") && antiCombatLogEnabled) { // API Call & safeguard:isInCombat -> ac:isInCombat
				if (player.hasAdmin() && adminsBypassCombatLogging) { // hasAdmin is wrapped
					player.combatLogTimer = 0;
				} else {
					player.addTag("ac:isInCombat"); // API Call & safeguard:isInCombat -> ac:isInCombat
					logDebug(player.name, "is now in combat");
					if (!player.combatLogWarningDisplayed) {
						player.sendMessage(`§r§6[§eAnti Cheats§6]§r You are now in combat, leaving during combat will result in a punishment.`); // API Call
						player.combatLogWarningDisplayed = true;
					} else {
						player.sendMessage(`§r§6[§eAnti Cheats§6]§r You are now in combat`); // API Call
					}
				}
			}

			if (!damager.hasTag("ac:isInCombat") && antiCombatLogEnabled) { // API Call & safeguard:isInCombat -> ac:isInCombat
				if (damager.hasAdmin() && adminsBypassCombatLogging) { // hasAdmin is wrapped
					damager.combatLogTimer = 0;
				} else {
					damager.addTag("ac:isInCombat"); // API Call & safeguard:isInCombat -> ac:isInCombat
					logDebug(damager.name, "is now in combat");
					if (!damager.combatLogWarningDisplayed) {
						damager.sendMessage(`§r§6[§eAnti Cheats§6]§r You are now in combat, leaving during combat will result in a punishment.`); // API Call
						damager.combatLogWarningDisplayed = true;
					} else {
						damager.sendMessage(`§r§6[§eAnti Cheats§6]§r You are now in combat.`); // API Call
					}
				}
			}
			damager.combatLogTimer = now;
			player.combatLogTimer = now;
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in entityHurt event:", data?.hurtEntity?.name, e, e.stack);
	}
})

function betaFeatures(player) {
	try {
		const { velocity } = player;

		if (player.hasAdmin()) return; // hasAdmin is wrapped
		const playerVelocity = velocity;

		const invalidVelocityCheckOn = ACModule.getModuleStatus(ACModule.Modules.velocityCheck);

		if (invalidVelocityCheckOn && (playerVelocity.y < -3.919921875 && (Date.now() - player.tridentLastUse) > 5000) && player.isFalling) {
			sendAnticheatAlert(player, "movement cheats (invalid y velocity)", playerVelocity.y.toFixed(3), ACModule.Modules.velocityCheck); // Wrapped
			teleportToGround(player); // Wrapped
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in betaFeatures for player:", player?.name, e, e.stack);
	}
}

Minecraft.system.runInterval(() => {
	try {
		world.getPlayers().forEach(player => { // API Call
			try {
				const antiFly = ACModule.getModuleStatus(ACModule.Modules.flyCheck);
				const velocityCheck = ACModule.getModuleStatus(ACModule.Modules.velocityCheck);

				const maxYVelocityThreshold = config.default.movement.fly.maxYVelocityThreshold;
				const { velocity: playerVelocity, speed } = player;
				const currentYVelocity = playerVelocity.y;

				if (!player.previousSpeed) player.previousSpeed = speed;
				if (!player.previousYVelocity) player.previousYVelocity = 0;

				const velocityDifference = Math.round(currentYVelocity - player.previousYVelocity);
				const speedDifference = speed - player.previousSpeed;

				if (velocityDifference > maxYVelocityThreshold && !player.isGliding && antiFly && player.previousYVelocity !== 0 && currentYVelocity !== 0) {
					teleportToGround(player); // Wrapped
					sendAnticheatAlert(player, "high velocity difference", velocityDifference, ACModule.Modules.flyCheck); // Wrapped
				}
				if (velocityCheck && speedDifference > 5 && !player.isGliding && player.previousSpeed !== 0 && speed !== 0 && player.currentGamemode !== Minecraft.GameMode.creative) {
					sendAnticheatAlert(player, "high speeds", speedDifference.toFixed(4), ACModule.Modules.velocityCheck); // Wrapped
					player.registerValidCoords = false;
					player.teleport(player.lastValidCoords, { keepVelocity: false, rotation: { x: 0, y: 0 } }); // API Call
				}

				player.previousYVelocity = currentYVelocity;
				player.previousSpeed = speed;
			} catch (playerError) {
				logDebug("[Anti Cheats ERROR] Error processing player in runInterval (fly check):", player?.name, playerError, playerError.stack);
			}
		})
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in runInterval (fly check):", e, e.stack);
	}
}, 10);


world.afterEvents.playerGameModeChange.subscribe((data) => {
	try {
		const {toGameMode,player} = data;
		player.currentGamemode = toGameMode;
		if(player.hasAdmin()) return; // hasAdmin is wrapped

		const antiGmcOn = ACModule.getModuleStatus(ACModule.Modules.antiGmc);
		if(antiGmcOn && toGameMode == Minecraft.GameMode.creative){
			player.setGameMode(Minecraft.GameMode.survival); // API Call
			sendAnticheatAlert(player,"gamemode creative","true",ACModule.Modules.antiGmc); // Wrapped
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in playerGameModeChange event:", data?.player?.name, e, e.stack);
	}
})

world.afterEvents.itemUse.subscribe((data) => {
	try {
		if (!(data.source instanceof Minecraft.Player)) return; 
		const player = data.source;
		const item = data.itemStack;
		if (!item) return;

		const enchantable = item.getComponent("enchantable"); 
		if (item.typeId === "minecraft:trident" && enchantable?.hasEnchantment("riptide")){ 
			player.tridentLastUse = Date.now();
		}
		if (item.typeId !== "ac:admin_panel") return; // safeguard:admin_panel -> ac:admin_panel
		
		if (!player.hasAdmin()) { // hasAdmin is wrapped
			player.playSound("random.anvil_land"); // API Call
			player.sendMessage("§6[§eAnti Cheats§6]§r §4You need admin tag to use admin panel!§r"); // API Call
			return;
		}
		if (!world.scoreboard.getObjective("ac:setup_success")) { // safeguard:setup_success -> ac:setup_success
			player.sendMessage(`§6[§eAnti Cheats§6]§c§l ERROR: §r§4AntiCheat not setup!§r`); // API Call
			player.sendMessage(`§6[§eAnti Cheats§6]§r§4 Run §c/function setup/setup§4 to setup anticheat!§r`); // API Call
			player.playSound("random.anvil_land"); // API Call
			return;
		}

		let mainForm = new ActionFormData()
			.title("Anti Cheats Admin Panel")
			.body(`Please select an option from below:`)
			.button("Settings", "textures/ui/settings_glyph_color_2x.png")
			.button("Quick Ban", "textures/ui/hammer_l.png")
			.button("Player Actions", "textures/ui/icon_multiplayer.png")
			.button("Unban Player", "textures/items/iron_sword.png")
			.button("Ban Logs", "textures/items/banner_pattern.png")
			player.playSound("random.pop");

		// Directly call the new main admin panel
		return ui.showAdminPanelMain(player);

	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in itemUse event for ac:admin_panel:", data?.source?.name, e, e.stack);
	}
});

world.afterEvents.playerBreakBlock.subscribe((data) => {
	try {
		const { player, dimension, block } = data;
		const blockId = data.brokenBlockPermutation.type.id;

		const diamondAlertOn = ACModule.getModuleStatus(ACModule.Modules.OreAlerts.diamondOre);
		const netheriteAlertOn = ACModule.getModuleStatus(ACModule.Modules.OreAlerts.netheriteOre);
		const antiNuker = ACModule.getModuleStatus(ACModule.Modules.nukerCheck);
		const autoModOn = ACModule.getModuleStatus(ACModule.Modules.autoMod);

		if (blockId == "minecraft:bedrock" || blockId == "minecraft:end_portal_frame") {
			if (player.hasAdmin() || player.currentGamemode === Minecraft.GameMode.creative) return; // hasAdmin wrapped
			block.setPermutation(data.brokenBlockPermutation); // API Call
			world.sendMessage(`§6[§eAnti Cheats§6]§r§c§l §r§c${player.name}§4 Attempted to break §c${blockId}`); // API Call
		}
		
		if (!config.default.world.nuker.blockExceptions.includes(blockId) && !player.getEffect("haste")) { // API Call
			player.blocksBroken++;
		}

		if (player.blocksBroken > config.default.world.nuker.maxBlocks && antiNuker) {
			if (player.hasAdmin() && !config.default.world.nuker.checkAdmins) return; // hasAdmin wrapped
			
			const items = dimension.getEntities({ // API Call
				location: { x: block.location.x, y: block.location.y, z: block.location.z },
				minDistance: 0,
				maxDistance: 2,
				type: "item"
			});

			for (const item of items) item.kill(); // API Call

			block.setPermutation(data.brokenBlockPermutation); // API Call
			if (autoModOn) {
				player.runCommand("gamemode adventure @s"); // API Call
				player.teleport({ x: player.location.x, y: 325, z: player.location.z }, { dimension: player.dimension, rotation: { x: 0, y: 0 }, keepVelocity: false }); // API Call
				sendAnticheatAlert(player, "nuker", player.blocksBroken, ACModule.Modules.nukerCheck); // Wrapped
			}
			return;
		}

		if (blockId == "minecraft:diamond_ore" || blockId == "minecraft:deepslate_diamond_ore") {
			if (!diamondAlertOn) return;
			sendMessageToAllAdmins(`§6[§eAnti Cheats§6]§5§l §r§e${player.name}§f mined x1 §ediamond ore§r`); // Wrapped
		}
		if (blockId == "minecraft:ancient_debris" && netheriteAlertOn) {
			sendMessageToAllAdmins(`§6[§eAnti Cheats§6]§5§l §r§e${player.name}§f mined x1 §enetherite ore§r`); // Wrapped
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in playerBreakBlock event:", data?.player?.name, e, e.stack);
	}
})

Minecraft.system.run(() => { // Final initialization run
	try {
		if(!world.acInitialized) Initialize(); // world.safeguardInitialized -> world.acInitialized
		for (const player of world.getPlayers()) { // API Call
			try {
				player.currentGamemode = player.getGameMode(); // API Call
			} catch (playerError) {
				logDebug("[Anti Cheats ERROR] Error setting currentGamemode for player on initial run:", player?.name, playerError, playerError.stack);
			}
		}
		initializeReachCheck(); 
		initializeNoSwingCheck(); 
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in final system.run for initialization:", e, e.stack);
	}
})
