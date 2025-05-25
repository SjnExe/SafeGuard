import * as Minecraft from "@minecraft/server";
import * as config from "../config";
import { ACModule } from "../classes/module";
const world = Minecraft.world;


export const millisecondTime = {
	minute: 60000,
	hour: 3600000,
	day: 86400000
}
const armorKeys = ["Head", "Chest", "Legs", "Feet", "Offhand"];

/**
 * Formats a duration given in milliseconds into a human-readable string.
 *
 * @param {number} milliseconds - The duration in milliseconds to format. 
 *                                Should be a non-negative value representing a past, current, or future duration.
 *                                If negative, it will return "No time set."
 * @returns {string} A formatted string representing the duration in days, hours, and minutes.
 */
export function formatMilliseconds(milliseconds) {
	if (milliseconds < 0) {
		return 'No time set.';
	}

	const totalSeconds = Math.floor(milliseconds / 1000);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	const formattedDays = String(days).padStart(2, '0');
	const formattedHours = String(hours).padStart(2, '0');
	const formattedMinutes = String(minutes).padStart(2, '0');

	return `${formattedDays} Days ${formattedHours} Hours ${formattedMinutes} Mins`;
}

/**
 * Creates a new Anti Cheats ban log
 *
 * @param {Object} obj - The ban log data
 * @param {string} obj.a - The banned person's name
 * @param {string} obj.b - The name of the admin who banned the person
 * @param {number} obj.c - Ban timestamp
 * @param {string} obj.d - Ban reason
 */
export function generateBanLog(obj) {
	let logsString = world.getDynamicProperty("ac:banLogs");
	let newLogs = [];

	if (logsString) {
		try {
			newLogs = JSON.parse(logsString);
		} catch (error) {
			console.error("Error parsing ban logs JSON:", error);
			// Start with an empty array if parsing fails
		}
	}

	// Add unique logId
	obj.logId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
	newLogs.push(obj);

	let stringifiedLogs = JSON.stringify(newLogs);
	
	while (newLogs.length > 0 && stringifiedLogs.length >= 32767) {
		newLogs.shift();
		stringifiedLogs = JSON.stringify(newLogs);
	}
	try {
		world.setDynamicProperty("ac:banLogs", stringifiedLogs);
	} catch (e) {
		console.error("[Anti Cheats ERROR] Failed to set banLogs dynamic property:", e, e.stack);
	}
}


/**
 * 
 * @param {string[]} punishment - An array with exactly two strings (time, day | hour | minute ).
 * @returns {Number} Timestamp
 */
export function parsePunishmentTime(punishment) {
	if (punishment.length !== 2) {
	  return null;
	}
  
	const amount = parseInt(punishment[0]);
	if (isNaN(amount) || amount <= 0) {
	  return null;
	}
  
	const unit = punishment[1].toLowerCase();
	const multiplier = millisecondTime[unit];
  
	if (!multiplier) {
	  return null;
	}
  
	return amount * multiplier;
}

export function invsee(senderPlayer, targetPlayer) {
	try {
		if (!(senderPlayer instanceof Minecraft.Player)) throw TypeError(`Parameter "senderPlayer" isn't instanceof Player`);
		if (!(targetPlayer instanceof Minecraft.Player)) throw TypeError(`Parameter "targetPlayer" isn't instanceof Player`);

		const inv = targetPlayer.getComponent("minecraft:inventory")?.container;
		if (!inv) {
			logDebug(`[Anti Cheats ERROR] Target player ${targetPlayer.name} inventory component not found in invsee.`);
			senderPlayer.sendMessage("§cCould not retrieve target player's inventory component.");
			return;
		}
		
		senderPlayer.sendMessage(`§6[§eAnti Cheats§6]§f ${targetPlayer.name}'s inventory:\n\n`);
		for (let i = 0; i < inv.size; i++) {
			const item = inv.getItem(i);
			if (!item) continue;

			const { amount,nameTag,typeId } = item;
			if (!typeId) continue;
			senderPlayer.sendMessage(`§6[§eAnti Cheats§6]§f Slot §e${i}§f: §e${typeId.replace('minecraft:','')}§f x§e${amount} ${nameTag ? `§fItem Name: §r${nameTag}` : ""}`);
		}
		
		const targetArmorContainer = targetPlayer.getComponent(Minecraft.EntityComponentTypes.Equippable);
		if (!targetArmorContainer) {
			logDebug(`[Anti Cheats ERROR] Target player ${targetPlayer.name} equippable component not found in invsee.`);
			senderPlayer.sendMessage("§cCould not retrieve target player's armor component.");
			return;
		}

		for (let i = 0; i < armorKeys.length; i++) {
			const item = targetArmorContainer.getEquipment(armorKeys[i]);
			if (!item) continue;

			const { amount, nameTag, typeId } = item;
			if (!typeId) continue;
			senderPlayer.sendMessage(`§6[§eAnti Cheats§6]§f Slot §e${armorKeys[i]}§f: §e${typeId.replace('minecraft:', '')}§f x§e${amount} ${nameTag ? `§fItem Name: §r${nameTag}` : ""}`);
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in invsee:", e, e.stack);
		if(senderPlayer instanceof Minecraft.Player) senderPlayer.sendMessage("§cAn error occurred while trying to display the inventory.");
	}
}
/**
 * 
 * @param {string} name - name of the player
 * @returns {Minecraft.Player} - player object
 */
export function getPlayerByName(name){
	try {
		const players = world.getPlayers({ name: name });
		return players[0] ?? false;
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Failed to get player by name:", name, e, e.stack);
		return false;
	}
}

/**
 * Adds or removes a scoreboard objective.
 * Uses `Minecraft.system.run()` to defer the execution, ensuring safety if called from restricted contexts
 * like "before event" handlers where direct scoreboard modification might be disallowed.
 *
 * @param {string} id The ID of the scoreboard objective.
 * @param {"add" | "remove"} type The action to perform: "add" to create the objective, "remove" to delete it.
 * @param {string} [displayName] Optional display name for the objective when adding. Defaults to `id` if not provided.
 *                                This parameter is ignored if `type` is "remove".
 * @throws {Error} If an invalid 'type' is provided, or if the scoreboard operation itself fails (e.g., objective already exists when adding, or doesn't exist when removing).
 */
export function scoreboardAction(id, type, displayName){
	if (!["add", "remove"].includes(type)) {
		throw new Error(`Invalid 'type': Expected "add" or "remove", got "${type}"`);
	}

    // Scoreboard operations (especially removal) can be restricted if called directly 
    // from certain "before event" handlers (e.g., world.beforeEvents.chatSend).
    // Using Minecraft.system.run() defers the execution to the next tick, 
    // ensuring the operation occurs outside the immediate event context, which is safer.
    Minecraft.system.run(() =>{
		try{
        	if(type === "remove") world.scoreboard.removeObjective(id);
        	else if(type === "add") world.scoreboard.addObjective(id, displayName || id); // Use displayName or default to id
		}
		catch(e){
			// Log the error or handle it more gracefully if needed, then rethrow.
			logDebug(`[Anti Cheats ERROR] Failed to ${type} scoreboard objective "${id}":`, e, e.stack);
			throw e; // Rethrow to indicate failure to the caller
		}
    });
}

export function logDebug(...msg){
	if(!msg.join(' ').startsWith("[")) msg.unshift("[Anti Cheats]")
	if(config.default.other.consoleDebugMode) console.warn(...msg);
}

/**
 * @param {Minecraft.Player} adminPlayer - The player who requested unban
 * @param {String} playerName - The name of the player to place in unban queue (CASE SENSITIVE)
 */
export function addPlayerToUnbanQueue(adminPlayer,playerName){
	try {
		if (!(adminPlayer instanceof Minecraft.Player)) throw TypeError("Param 'adminPlayer' isn't instanceof Player");
		if(typeof playerName !== "string") throw TypeError(`Param 'playerName' is typeof '${typeof playerName}', should be string`);

		if (world.acUnbanQueue.includes(playerName)) {
			adminPlayer.sendMessage(`§6[§eAnti Cheats§6]§f The player §e${playerName}§f is already pending an unban.`);
			return;
		}
		world.acUnbanQueue.push(playerName);
		world.setDynamicProperty("ac:unbanQueue", JSON.stringify(world.acUnbanQueue));
		adminPlayer.sendMessage(`§6[§eAnti Cheats§6]§f The player §e${playerName}§f was successfully put into unban queue, they will be unbanned when they join.`);
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in addPlayerToUnbanQueue:", e, e.stack);
		if(adminPlayer instanceof Minecraft.Player) adminPlayer.sendMessage("§cAn error occurred while adding player to unban queue.");
	}
}

/**
 * Sends a message to all players who have admin privileges (checked via `player.hasAdmin()`).
 * Can optionally filter recipients to only those admins who also have a specific scoreboard objective set (e.g., for notifications).
 *
 * @param {string} [message="No message provided"] - The message string to send.
 * @param {boolean} [isANotification=false] - If true, only sends to admins who also have the "ac:notify" scoreboard objective set to 1.
 *                                           If false (default), sends to all players for whom `player.hasAdmin()` is true.
 * @returns {void}
 */
export function sendMessageToAllAdmins(message = "No message provided",isANotification = false){
	// Note: A previous `if(config.default.debug) return world.sendMessage(message);` was removed
	// as `config.default.debug` was not defined in `config.js`, making it dead code.
	// This function now strictly targets admins (optionally filtered by notification settings).
	// If a global broadcast for admin messages is needed for debugging, 
	// it should be explicitly configured and implemented elsewhere or by modifying this function with a clear config flag.
	let entityQueryOptions = {};
	if(isANotification){
		entityQueryOptions.scoreOptions = [{
			objective: "ac:notify",
			maxScore: 1,
			minScore: 1,
			exclude: false
		}]
	}
	
	try {
		const adminPlayers = world.getPlayers(entityQueryOptions);
		adminPlayers.forEach((admin) => {
			if(admin.hasAdmin()) {
				try {
					admin.sendMessage(message);
				} catch (e) {
					logDebug("[Anti Cheats ERROR] Failed to send message to admin", admin.name, "in sendMessageToAllAdmins:", e, e.stack);
				}
			}
		})
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in sendMessageToAllAdmins (getting players or iterating):", e, e.stack);
	}
}

/**
 * Teleports the given player to the nearest ground block directly below their current position.
 *
 * @param {Minecraft.Player} player - The player to teleport to the ground.
 * @returns {void} Logs a debug message if the ground block cannot be found.
 */
export function teleportToGround(player) {
	const playerPosition = player.location;

	const raycastDirection = { x: 0, y: -1, z: 0 };
	const dimension = player.dimension;

	try {
		const tempBlock = dimension.getBlockFromRay(playerPosition, raycastDirection)?.block;
		if (!tempBlock) {
			logDebug("[Anti Cheats] Couldn't find a ground block to teleport player to:", player.name);
			return;
		}
		Minecraft.system.run(() => {
			try {
				player.tryTeleport({ x: tempBlock.x, y: tempBlock.y + 1, z: tempBlock.z });
			} catch (e) {
				logDebug("[Anti Cheats ERROR] Failed to teleport player", player.name, "to ground (inside system.run):", e, e.stack);
			}
		});
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in teleportToGround (getting block or scheduling run):", player.name, e, e.stack);
	}
}

/**
 * Copies the inventory from the target player to the sender player.
 *
 * @param {Minecraft.Player} senderPlayer - The player receiving the copied inventory.
 * @param {Minecraft.Player} targetPlayer - The player whose inventory is being copied.
 * @throws {TypeError} Throws an error if either parameter is not an instance of `Minecraft.Player`.
 * @returns {void} Sends a message to the sender upon completion.
 */
export function copyInv(senderPlayer, targetPlayer) {
	if (!(senderPlayer instanceof Minecraft.Player)) throw TypeError(`Parameter "senderPlayer" isn't instanceof Player`);
	if (!(targetPlayer instanceof Minecraft.Player)) throw TypeError(`Parameter "targetPlayer" isn't instanceof Player`);

	try {
		Minecraft.system.run(() => {
			try {
				const targetContainer = targetPlayer.getComponent("minecraft:inventory")?.container;
				const container = senderPlayer.getComponent("minecraft:inventory")?.container;

				if (!targetContainer || !container) {
					logDebug(`[Anti Cheats ERROR] Inventory component not found for sender or target in copyInv. Sender: ${senderPlayer.name}, Target: ${targetPlayer.name}`);
					senderPlayer.sendMessage("§cError accessing inventory components.");
					return;
				}
				container.clearAll();

				for (let i = 0; i < targetContainer.size; i++) {
					const item = targetContainer.getItem(i);
					if (!item) continue;
					container.setItem(i, item);
				}
				
				const armorContainer = senderPlayer.getComponent(Minecraft.EntityComponentTypes.Equippable);
				const targetArmorContainer = targetPlayer.getComponent(Minecraft.EntityComponentTypes.Equippable);

				if (!armorContainer || !targetArmorContainer) {
					logDebug(`[Anti Cheats ERROR] Equippable component not found for sender or target in copyInv. Sender: ${senderPlayer.name}, Target: ${targetPlayer.name}`);
					senderPlayer.sendMessage("§cError accessing armor components.");
					return;
				}
				
				for(let i = 0; i < armorKeys.length; i++){
					const item = targetArmorContainer.getEquipment(armorKeys[i]);
					if(!item) continue;
					armorContainer.setEquipment(armorKeys[i],item);
				}
				senderPlayer.sendMessage(`§6[§eAnti Cheats§6]§f Finished copying inventory of §e${targetPlayer.name}`);
			} catch (e) {
				logDebug("[Anti Cheats ERROR] Error during copyInv (inside system.run):", senderPlayer.name, targetPlayer.name, e, e.stack);
				if(senderPlayer instanceof Minecraft.Player) senderPlayer.sendMessage("§cAn error occurred while copying the inventory.");
			}
		});
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error scheduling copyInv:", senderPlayer.name, targetPlayer.name, e, e.stack);
		if(senderPlayer instanceof Minecraft.Player) senderPlayer.sendMessage("§cAn error occurred while trying to copy the inventory.");
	}
}

/**
 * Sends an anti-cheat alert for a detected player, optionally kicking them if AutoMod is enabled.
 *
 * @param {Minecraft.Player} detectedPlayer - The player detected using cheats.
 * @param {string} detectionType - The type of cheat detected (e.g., "autoclicker").
 * @param {string | number} detectionValue - The detected value related to the cheat (e.g., CPS count).
 * @param {ACModule.Modules} module - The name of the Anti Cheats module that detected the cheat.
 * @throws {TypeError} Throws an error if parameters are of the wrong type.
 * @throws {ReferenceError} Throws an error if the module is not valid.
 * @returns {void} Sends a message to admins or all players based on the configuration.
 */
export function sendAnticheatAlert(detectedPlayer, detectionType, detectionValue, module) {
	if (!(detectedPlayer instanceof Minecraft.Player)) throw TypeError(`"detectedPlayer" is not an instance of Minecraft Player`);
	if (typeof detectionType !== "string") throw TypeError(`"detectionType" is typeof ${typeof detectionType}, not string`);
	if (typeof detectionValue !== "string" && typeof detectionValue !== "number") throw TypeError(`"detectionValue" is typeof ${typeof detectionValue}, not string or number`);

	if (!ACModule.getValidModules().includes(module)) throw ReferenceError(`"${module}" isn't an Anti Cheats module.`);

	try {
		if (!(detectedPlayer instanceof Minecraft.Player)) throw TypeError(`"detectedPlayer" is not an instance of Minecraft Player`);
		if (typeof detectionType !== "string") throw TypeError(`"detectionType" is typeof ${typeof detectionType}, not string`);
		if (typeof detectionValue !== "string" && typeof detectionValue !== "number") throw TypeError(`"detectionValue" is typeof ${typeof detectionValue}, not string or number`);

		if (!ACModule.getValidModules().includes(module)) throw ReferenceError(`"${module}" isn't an Anti Cheats module.`);

		detectedPlayer.setWarning(module); // This now has its own try-catch

		if (ACModule.getModuleStatus(ACModule.Modules.autoMod)) {
			sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§r§c ${detectedPlayer.name}§r was automatically kicked by Anti Cheats AutoMod module. Detection[${module} = ${detectionValue}]`, true);
			detectedPlayer.runCommand(`kick "${detectedPlayer.name}" §6[§eAnti Cheats AutoMod§6]§r You have been detected cheating. Module[${module} = ${detectionValue}]`);
		}

		const message = `§6[§eAnti Cheats§6]§r §c§l${detectedPlayer.name}§r§4 was detected using §l§c${detectionType}§r§4 with a value of §l§c${detectionValue}§r§4!`;
		if (config.default.other.sendAlertsToEveryone) {
			world.sendMessage(message);
		} else {
			sendMessageToAllAdmins(message, false);
		}
	} catch (e) {
		logDebug("[Anti Cheats ERROR] Error in sendAnticheatAlert:", detectedPlayer?.name, detectionType, module, e, e.stack);
	}
}