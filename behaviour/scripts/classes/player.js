import { Player, world, InputPermissionCategory } from "@minecraft/server";
import { formatMilliseconds, generateBanLog, logDebug, sendMessageToAllAdmins } from "../assets/util";
import { ACModule } from "./module";

Player.prototype.initialClick = 0;
Player.prototype.finalCps = 0;
Player.prototype.currentCps = 0;
Player.prototype.hitEntities = [];
Player.prototype.previousYVelocity = 0;
Player.prototype.previousSpeed = 0;
Player.prototype.registerValidCoords = true; 
Player.prototype.isMuted = false;
Player.prototype.tridentLastUse = 0;

//get warns
Player.prototype.getWarnings = function(){
	const warnings_string = this.getDynamicProperty("ac:warnings");
	if(!warnings_string) return {};
	try {
		const warnings = JSON.parse(warnings_string);
		return warnings;
	} catch (error) {
		logDebug(`[Anti Cheats] Error parsing warnings JSON for player ${this.name}:`, error);
		return {}; // Default to an empty object on error
	}
}
//clear warns
Player.prototype.clearWarnings = function(){
	try {
		this.setDynamicProperty("ac:warnings",JSON.stringify({}));
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to clear warnings for ${this.name}:`, e, e.stack);
	}
}
//set warn
Player.prototype.setWarning = function(module){
	try {
		if (module !== "manual" && !ACModule.getValidModules().includes(module)) {
			logDebug(`[Anti Cheats ERROR] Invalid module type for setWarning: ${module}`);
			throw ReferenceError(`"${module}" isn't a safeguard module.`);
		}
		const warnings = this.getWarnings(); // Already has try-catch for parsing
		const moduleID = module === "manual" ? module : ACModule.getModuleID(module);

		if(!warnings[moduleID]) warnings[moduleID] = 1;
		else warnings[moduleID] += 1;
		
		logDebug(JSON.stringify(warnings));

		this.setDynamicProperty("ac:warnings", JSON.stringify(warnings));

		if(module === "manual"){
			const manualWarningCount = warnings[moduleID];
			if (manualWarningCount === 2) {
				this.sendMessage(`§r§6[§eAnti Cheats§6]§4 Warning!§c Next warning from an admin will result in a permanent ban.`);
			} else if(manualWarningCount === 3){
				this.ban("Reaching 3 manual warnings", -1, true, "Anti Cheats AntiCheat"); // ban itself will be wrapped
				this.runCommand(`kick "${this.name}" §r§6[§eAnti Cheats§6]§r §4You are permanently banned.\n§4Reason: §cReaching 3 manual warnings.\n§4Banned by: §cAnti Cheats AntiCheat`);
				sendMessageToAllAdmins(`§r§6[§eAnti Cheats Notify§6]§4 The player §c${this.name}§4 was permanently banned for reaching 3 manual warnings.`,true);
			}
		}
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to set warning for ${this.name} with module ${module}:`, e, e.stack);
	}
}

//get ban info 
Player.prototype.getBan = function() {
	const banProperty = this.getDynamicProperty("ac:banInfo");
	if (!banProperty) return { isBanned: false };

	try {
		const playerBanInfo = JSON.parse(banProperty);

		// It's crucial to check if playerBanInfo is an object and has the expected properties
		if (typeof playerBanInfo !== 'object' || playerBanInfo === null || typeof playerBanInfo.isBanned === 'undefined') {
			logDebug(`[Anti Cheats] Invalid or malformed banInfo JSON for player ${this.name}. Property: ${banProperty}`);
			return { isBanned: false };
		}

		if (!playerBanInfo.isBanned) return { isBanned: false };

		// Check if the ban has expired
		if (!playerBanInfo.isPermanent && Date.now() > playerBanInfo.unbanTime) {
			// Unban the player by updating the dynamic property
			const unbannedInfo = { ...playerBanInfo, isBanned: false };
			try {
				this.setDynamicProperty("ac:banInfo", JSON.stringify(unbannedInfo));
			} catch (e) {
				logDebug(`[Anti Cheats ERROR] Failed to set dynamic property for unbanned player ${this.name} in getBan:`, e, e.stack);
			}
			return { isBanned: false };
		}

		return playerBanInfo;
	} catch (error) {
		logDebug(`[Anti Cheats ERROR] Error parsing banInfo JSON for player ${this.name}:`, error, `Raw property: ${banProperty}`);
		return { isBanned: false }; // Default to not banned on error
	}
};

//mute
Player.prototype.getMuteInfo = function(){
	const muteInfoString = this.getDynamicProperty("ac:muteInfo") ?? '{"duration":-1, "isPermanent": false, "reason": "", "admin": ""}';
	try {
		let muteInfo = JSON.parse(muteInfoString);

		// Ensure essential properties exist and have default values if missing from parsed JSON
		muteInfo.duration = muteInfo.duration ?? -1;
		muteInfo.isPermanent = muteInfo.isPermanent ?? false;
		muteInfo.reason = muteInfo.reason ?? "";
		muteInfo.admin = muteInfo.admin ?? "";

		const isActive = muteInfo.isPermanent ? true : (muteInfo.duration > 0 && (muteInfo.duration - Date.now()) > 0);
		muteInfo.isActive = isActive;
		
		// If not active and not permanent, ensure duration reflects this (e.g., -1 or 0)
		if(!isActive && !muteInfo.isPermanent) {
			muteInfo.duration = -1; 
		}
		
		this.isMuted = isActive;
		// logDebug("[Mute Info]", isActive, muteInfo.isPermanent, muteInfo.duration, muteInfo.reason, muteInfo.admin);
		return muteInfo;
	} catch (error) {
		logDebug(`[Anti Cheats] Error parsing muteInfo JSON for player ${this.name}:`, error, `Raw property: ${muteInfoString}`);
		this.isMuted = false;
		return { duration: -1, isPermanent: false, reason: "", admin: "", isActive: false }; // Default structure
	}
}

//ban
Player.prototype.ban = function(reason="No reason provided", unbanTime, permanent, admin) {
	if (typeof reason !== "string") throw TypeError(`Parameter "reason" is typeof "${typeof reason}", should be typeof string`);
	if (typeof permanent !== "boolean") throw TypeError(`Parameter "permanent" is typeof "${typeof permanent}", should be typeof boolean`);
	if (typeof unbanTime !== "number") throw TypeError(`Parameter "time" is typeof "${typeof unbanTime}", should be typeof number`);
	
	if(admin && typeof admin !== "string"){
		if (!(admin instanceof Player)) throw TypeError(`Parameter "admin" is not instanceof player`);
		if (!admin.hasAdmin()) throw Error(`The player "${admin.name}" does not have permission to ban`);
	}
	if (this.hasAdmin()) throw Error(`Player "${this.name}" cannot be banned, is admin`);
	if (reason.length > 200) throw RangeError(`Reason length is more than allowed 200 characters long (is ${reason.length})`);

	const banProperty = this.getDynamicProperty("ac:banInfo");

	if (banProperty?.isBanned) throw SyntaxError(`Player "${this.name}" is already banned`);

	const bannedByAdminName = (admin?.name ?? admin) || "Anti Cheats AntiCheat";

	try {
		//a - banned persons name
		//b - admin name
		//c - time of ban
		//d - ban reason
		try{ // Inner try-catch for generateBanLog as it's a distinct operation
			generateBanLog({ // generateBanLog itself has internal try-catch for its parsing
				a:this.name,
				b:bannedByAdminName,
				c:Date.now(),
				d:reason
			})
		}
		catch(e){ // This would catch errors in the generateBanLog call itself, not its internal logic
			logDebug(`[Anti Cheats ERROR] Failed to generate ban log for ${this.name}:`, e, e.stack);
			sendMessageToAllAdmins(`§6[§eAnti Cheats§6]§c There was an error creating a ban log for §4${this.name}§c Error: \n§4${e}`)
		}

		const banObject = {
			isBanned: true,
			unbanTime: unbanTime,
			isPermanent: permanent,
			bannedBy: bannedByAdminName,
			banTime: Date.now(),
			reason: reason,
		};

		this.setDynamicProperty("ac:banInfo", JSON.stringify(banObject));
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to ban player ${this.name}:`, e, e.stack);
		// Potentially send message to admin if ban failed
		if (admin instanceof Player) {
			admin.sendMessage(`§c[Anti Cheats] Failed to ban ${this.name}. Check console for errors.`);
		}
	}
};

//unban
Player.prototype.unban = function() {
	function removeFromUnbanQueue(player) {
		try {
			const unbanInfo = {
				isBanned: false,
			};
			const playerIndex = world.safeguardUnbanQueue.indexOf(player.name);
			if (playerIndex > -1) {
				world.safeguardUnbanQueue.splice(playerIndex, 1);
				try {
					world.setDynamicProperty("ac:unbanQueue", JSON.stringify(world.acUnbanQueue));
				} catch (e) {
					logDebug(`[Anti Cheats ERROR] Failed to set unbanQueue dynamic property for ${player.name}:`, e, e.stack);
				}
			}
			try {
				player.setDynamicProperty("ac:banInfo", JSON.stringify(unbanInfo));
			} catch (e) {
				logDebug(`[Anti Cheats ERROR] Failed to set banInfo dynamic property for ${player.name} during unban:`, e, e.stack);
			}
		} catch (e) {
			logDebug(`[Anti Cheats ERROR] Error in removeFromUnbanQueue for ${player.name}:`, e, e.stack);
		}
	}
	const banProperty = this.getDynamicProperty("ac:banInfo");
	if (!banProperty) {
		logDebug(`Player "${this.name}" is not banned (property missing), no unban action needed.`);
		// Attempt to remove from unban queue just in case, and ensure ban info is cleared.
		removeFromUnbanQueue(this); // Ensures banInfo is cleared and queue is updated
		return true; // Considered successful as the state is now definitely "not banned".
	}

	try {
		const banInfo = JSON.parse(banProperty);

		if (typeof banInfo !== 'object' || banInfo === null || typeof banInfo.isBanned === 'undefined') {
			logDebug(`[Anti Cheats] Invalid or malformed banInfo JSON for player ${this.name} during unban. Property: ${banProperty}. Clearing ban state.`);
			removeFromUnbanQueue(this); // Attempt to clear queue and set clean ban state
			return true; 
		}

		if (!banInfo.isBanned) {
			logDebug(`Player "${this.name}" is not marked as banned in banInfo (.isBanned=${banInfo.isBanned}). Ensuring clean state.`);
			// If they are in unban queue but record says not banned, still attempt to clean queue and record.
			removeFromUnbanQueue(this);
			return true; // Return true as an unban operation was effectively performed or corrected.
		}
		
		// Player is confirmed banned, proceed with normal unban.
		removeFromUnbanQueue(this);
		return true;

	} catch (error) {
		logDebug(`[Anti Cheats] Error parsing banInfo JSON for player ${this.name} during unban:`, error, `Raw property: ${banProperty}. Force clearing ban state.`);
		// If parsing fails, it's unclear if the player was banned but err on the side of unbanning.
		removeFromUnbanQueue(this); // Force clear queue and set clean ban state
		return true; // Return true as a corrective unban action was taken.
	}
};

Player.prototype.setFreezeTo = function(freeze){
	try {
		if(typeof freeze !== "boolean") throw TypeError(`Type of freeze is "${typeof freeze}" should be boolean`);

		this.setDynamicProperty("ac:freezeStatus",freeze);

		this.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera, !freeze);
		this.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, !freeze);
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to set freeze status for ${this.name} to ${freeze}:`, e, e.stack);
	}
};

//mute
Player.prototype.mute = function(adminPlayer,reason, durationMs) {
	if (adminPlayer && typeof adminPlayer !== "string") {
		if (!(adminPlayer instanceof Player)) throw TypeError(`Parameter "adminPlayer" is not instanceof player`);
		if (!adminPlayer.hasAdmin()) throw Error(`The player "${adminPlayer.name}" does not have permission to ban`);
	}
	if(typeof reason !== "string") throw TypeError(`Type of reason is "${typeof reason}" should be string`);
	if(typeof durationMs !== "number") throw TypeError(`Type of durationMs is "${typeof durationMs}" should be number`);

	const adminName = (adminPlayer?.name ?? adminPlayer) || "Anti Cheats AntiCheat";
	try {
		const isPermanent = durationMs == -1;
		const endTime = isPermanent ? "permanent" : Date.now() + durationMs;
		const muteTimeDisplay = isPermanent ? "permanent" : formatMilliseconds(durationMs); // formatMilliseconds is from util, assume it's safe or handle there
		const muteInfo = {
			admin: adminName,
			duration: endTime,
			isPermanent: isPermanent,
			reason: reason
		}
		this.setDynamicProperty("ac:muteInfo", JSON.stringify(muteInfo));
		this.isMuted = true;

		// Notify player and admins
		if (adminPlayer instanceof Player) { // Check if adminPlayer is a Player object
			adminPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You have muted §e${this.name}§f for §e${muteTimeDisplay}.`);
		} else if (typeof adminPlayer === 'string') {
			// If adminPlayer is a string (name), try to find the player and send message
			const actualAdminPlayer = Array.from(world.getPlayers()).find(p => p.name === adminPlayer); // world.getPlayers can be wrapped if needed
			actualAdminPlayer?.sendMessage(`§6[§eAnti Cheats§6]§f You have muted §e${this.name}§f for §e${muteTimeDisplay}.`);
		}
		sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§e ${this.name}§f has been muted for §e${muteTimeDisplay}§f by §e${adminName}§f. Reason: §e${reason}§f`, true); // sendMessageToAllAdmins from util
		logDebug(`MUTED NAME="${this.name}"; REASON="${reason}"; DURATION=${muteTimeDisplay}`);
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to mute player ${this.name}:`, e, e.stack);
		if (adminPlayer instanceof Player) {
			adminPlayer.sendMessage(`§c[Anti Cheats] Failed to mute ${this.name}. Check console for errors.`);
		}
	}
}

//unmute
Player.prototype.unmute = function(){
	try {
		if(!this.isMuted) throw Error(`"${this.name}" is not muted`);

		const muteInfo_string = JSON.stringify({
			admin: "",
			duration: -1,
			isPermanent: false,
			reason: ""
		});;
		this.setDynamicProperty("ac:muteInfo", muteInfo_string);
		this.isMuted = false;

		logDebug(muteInfo_string);
	} catch (e) {
		logDebug(`[Anti Cheats ERROR] Failed to unmute player ${this.name}:`, e, e.stack);
	}
}

/**
 * @function isOwner
 * @memberof Player.prototype
 * @returns {boolean} True if the player is the designated owner of the world, false otherwise.
 * @description Checks if the current player is the owner of the world.
 * The owner's name is stored in the "ac:ownerPlayerName" world dynamic property.
 * This method compares the player's name (`this.name`) against the stored owner name.
 * If "ac:ownerPlayerName" is not set or is an empty string, it returns false,
 * indicating no owner has been designated or the property is missing.
 * The actual designation of the owner is handled during the addon's initialization
 * in `initialize.js`, where the first player to join a new world (without an existing owner)
 * is typically set as the owner.
 * @example
 * if (player.isOwner()) {
 *   player.sendMessage("You have owner privileges.");
 * }
 */
Player.prototype.isOwner = function(){
	// Retrieve the owner's name from a world dynamic property.
	const ownerPlayerName = world.getDynamicProperty("ac:ownerPlayerName");

	// If the dynamic property is not set or is empty, no one is the owner yet.
	if (typeof ownerPlayerName !== 'string' || ownerPlayerName.trim() === '') {
		// logDebug(`[Anti Cheats] isOwner check: ac:ownerPlayerName is not set. No player is currently designated as owner.`);
		return false;
	}

	// Compare the current player's name with the stored owner's name.
	const isPlayerOwner = this.name === ownerPlayerName;
	// logDebug(`[Anti Cheats] isOwner check: Current player: ${this.name}, Stored owner: ${ownerPlayerName}, Is owner: ${isPlayerOwner}`);
	return isPlayerOwner;
	// TODO: The actual setting of "ac:ownerPlayerName" will be handled in 'initialize.js'
	// by designating the first player to join a world where "ac:ownerPlayerName" is not yet set.
	// NOTE: owner should have more powers than admins, for example editing config and denying admins permissions.
	// CHALLENGE: determining which player to give owner to on initialize - Addressed by first-joiner in initialize.js.
	//
	// POSSIBLE SOLUTION (Old, superseded by current design):
	// first player to use owner password, the owner password could be either set inside config.js (where only owner can access)
	// another way could be to randomly generate a password on initialize, and display it to the first player to run setup
	// problem, if owner doesn't setup correctly, another admin can get owner status with no way to get it back
};

//check admin status
Player.prototype.hasAdmin = function() {
	// this is in case I ever change the admin tag or if the user wants to change it
	return this.hasTag("admin") || this.isOwner();
};

logDebug(`[Anti Cheats] Updated Player class`);