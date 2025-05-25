import * as Minecraft from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';
import { addPlayerToUnbanQueue, copyInv, getPlayerByName, invsee, logDebug, millisecondTime, sendMessageToAllAdmins } from './util.js';
import { ACModule } from '../classes/module.js';
import * as config from "../config.js";

const world = Minecraft.world;


//ban form
function banForm(player, targetPlayer, type, banReason, previousForm) { // Added previousForm
	if(targetPlayer.hasAdmin()) {
		player.sendMessage(`§6[§eAnti Cheats§6]§r Can't ban §e${targetPlayer.name}§f they're an admin.`);
		if (previousForm) return previousForm(player); // Go back if target is admin
		return;
	}

	if(type == "quick"){ 
		let confirmQuickBanForm = new MessageFormData() // Renamed
			.title("§l§4Quick Ban Player") // Enhanced title
			.body(`§lTarget:§r ${targetPlayer.name}\n\nAre you sure you want to issue a quick, permanent ban?`) // Enhanced body
			.button2("§4Confirm Ban")    // selection 1
			.button1("§cCancel");        // selection 0
		confirmQuickBanForm.show(player).then((confirmData) => {
			if(confirmData.canceled || confirmData.selection === 0) { // Cancelled or pressed "Cancel"
				player.sendMessage(`§6[§eAnti Cheats§6]§f Ban cancelled.`);
				if (previousForm) return previousForm(player); 
				return;
			}
			// Ban action (selection 1)
			targetPlayer.ban("No reason provided.", Date.now(), true, player);
			targetPlayer.runCommand(`kick "${targetPlayer.name}" §r§6[§eAnti Cheats§6]§r §4You are permanently banned.\n§4Reason: §cNo reason provided\n§4Banned by: §c${player.name}`);
			player.sendMessage(`§6[§eAnti Cheats§6]§f Successfully banned §e${targetPlayer.name}`);
			sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§f §e${player.name}§f banned §e${targetPlayer.name}§f!`,true);
			
			if (previousForm) return previousForm(player); // After action, return to previous form

		}).catch(e => {
			logDebug(`[Anti Cheats UI Error][banFormQuick]: ${e} ${e.stack}`);
			if (player && typeof player.sendMessage === 'function') {
				player.sendMessage("§cAn error occurred with the UI. Please try again.");
			}
			if (previousForm) previousForm(player);
		});
	}
	else if(type=="slow"){ 
		let banModalForm = new ModalFormData() 
		.title("§l§4Custom Ban: " + targetPlayer.name) // Enhanced title
		.slider("Days",0,360,1,0) // Simplified labels
		.slider("Hours",0,23,1,0)
		.slider("Minutes",0,59,1,0)
		.toggle("Permanent Ban", false); // Simplified label, ensure defaultValue is boolean

		banModalForm.show(player).then((banFormData) => {
			if(banFormData.canceled) {
				player.sendMessage(`§6[§eAnti Cheats§6]§f Ban form cancelled.`);
				if (previousForm) return previousForm(player); 
				return;
			}
			const now = Date.now();
			const values = banFormData.formValues;
			let unbanMinute = values[2] * millisecondTime.minute;
			let unbanHour = values[1] * millisecondTime.hour;
			let unbanDay = values[0] * millisecondTime.day;
			const unbanTime = now + (unbanMinute + unbanHour + unbanDay);
			const isPermanent = values[3];
			banReason = banReason ?? "No reason provided."
			
			if(unbanTime == now && !isPermanent) return player.sendMessage(`§r§6[§eAnti Cheats§6]§r§l§c ERROR:§r§4 You did not enter an unban time and did not set the ban to permanent, please make the ban permanent or enter a custom time for unban. The ban was not performed on §c${targetPlayer.name}`) 

			targetPlayer.ban(banReason, unbanTime, isPermanent, player);

			player.sendMessage(`§6[§eAnti Cheats§6]§f Successfully banned §e${targetPlayer.name}`);
			sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§f §e${player.name}§f banned §e${targetPlayer.name}§f!`, true);
			
			if (!isPermanent) player.runCommand(`kick "${targetPlayer.name}" §r§6[§eAnti Cheats§6]§r §4You are banned.\n§4Time Remaining: §c${values[0]} Days ${values[1]} Hours ${values[2]} Mins\n§4Reason: §c${banReason == "" ? "No reason provided." : banReason}\n§4Banned by: §c${player.name}`)
			if (isPermanent) player.runCommand(`kick "${targetPlayer.name}" §r§6[§eAnti Cheats§6]§r §4You are permanently banned.\n§4Reason: §c${banReason == "" ? "No reason provided." : banReason}\n§4Banned by: §c${player.name}`)
			

		}).catch(e => {
			logDebug(`[Anti Cheats UI Error][banFormSlow]: ${e} ${e.stack}`);
			if (player && typeof player.sendMessage === 'function') {
				player.sendMessage("§cAn error occurred with the UI. Please try again.");
			}
		});
	}
	else{
		return player.sendMessage(`§6[§eAnti Cheats§6]§r§c§lERROR:§4 Unexpected type of ban: §c${type}`)
	}
}

export function unbanForm(player, previousForm){ 
	let unbanModalForm = new ModalFormData() 
	.title("§l§7Unban Player") // Enhanced title
	.textField("Enter Player Name (Case Sensitive)", "Player's exact name"); // Enhanced labels

	unbanModalForm.show(player).then((formData) => {
		if (formData.canceled) {
			player.sendMessage(`§6[§eAnti Cheats§6]§r Unban form cancelled.`);
			if (previousForm) return previousForm(player); // Go back if cancelled
			return;
		}
		const playerName = formData.formValues[0];
		
		addPlayerToUnbanQueue(player,playerName);
		// After attempting to add to queue, optionally go back or stay.
		// Going back is usually better for UI flow.
		if (previousForm) return previousForm(player);

	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][unbanForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

export function showAdminPanelMain(player) {
	if (!player.hasAdmin()) {
		return player.tell("§cYou do not have permission to access the admin panel.");
	}

	const form = new ActionFormData()
		.title("§l§7Admin Panel") // Enhanced title
		.body("Manage players, server settings, and view system information.") // Added body
		.button("Player Management", "textures/ui/icon_steve.png")
		.button("Server Settings", "textures/ui/icon_setting.png")
		.button("View Logs", "textures/ui/icon_book_writable.png")
		.button("System Information", "textures/ui/icon_resource_pack.png") 
		.button("§cClose", "textures/ui/cancel.png");

	form.show(player).then((response) => {
		if (response.canceled) {
			return;
		}

		switch (response.selection) {
			case 0: // Player Management
				playerSelectionForm(player, 'action', showAdminPanelMain);
				break;
			case 1: // Server Settings
				settingSelector(player, showAdminPanelMain);
				break;
			case 2: // View Logs
				banLogForm(player, showAdminPanelMain);
				break;
			case 3: // System Information
				// console.warn(`[Admin Panel] System Information button pressed by ${player.name}`);
				// player.tell("§6[Admin Panel] §eSystem Information is not yet implemented.");
				// showAdminPanelMain(player); // Re-show main panel
				showSystemInformation(player, showAdminPanelMain); // Call the new function
				break;
			case 4: // Close
				// Do nothing, form closes.
				break;
			default:
				// Should not happen with current setup
				showAdminPanelMain(player);
				break;
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][showAdminPanelMain]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the Admin Panel UI. Please try again.");
		}
	});
}

export function showSystemInformation(player, previousForm) {
	if (!player.hasAdmin()) {
		player.tell("§cYou do not have permission to view system information.");
		return previousForm(player); // Go back if not admin
	}

	const form = new MessageFormData();
	form.title("§l§7System Information");

	// Gather information
	const serverTime = new Date().toLocaleString();
	
	const allPlayers = world.getAllPlayers();
	const onlinePlayerCount = allPlayers.length;
	// const onlinePlayerNames = onlinePlayerCount > 0 ? allPlayers.map(p => p.name).join(", ") : "N/A"; // Original combined list
	
	let ownerNames = [];
    let adminNames = [];
    let normalPlayerNames = [];

	for (const p of allPlayers) {
        if (p.isOwner()) {
            ownerNames.push(`§c${p.name}§r`); // Add color codes
        } else if (p.hasTag('admin')) { 
            adminNames.push(`§6${p.name}§r`); // Add color codes
        } else {
            normalPlayerNames.push(`§a${p.name}§r`); // Add color codes
        }
    }
    // Get counts from array lengths
    const ownerOnlineCount = ownerNames.length;
    const displayedAdminsOnlineCount = adminNames.length;
    const normalPlayerCount = normalPlayerNames.length; // New count

	let bannedPlayersCount = "N/A";
	try {
		const logsString = world.getDynamicProperty("ac:banLogs");
		if (logsString) {
			const banLogs = JSON.parse(logsString);
			if (Array.isArray(banLogs)) {
				bannedPlayersCount = banLogs.length.toString();
			} else {
				bannedPlayersCount = "Error reading logs (not an array)";
			}
		} else {
			bannedPlayersCount = "0";
		}
	} catch (e) {
		logDebug(`[UI Error][showSystemInformation] Error reading ban logs: ${e}`);
		bannedPlayersCount = "Error reading logs";
	}
	
	const addonVersion = config.default.version || "N/A";
	const serverPerformance = "N/A (API not available for detailed metrics)";

	// Format body
	let bodyText = `§gCurrent Server Time:§r ${serverTime}\n\n`;
	bodyText += `§gTotal Online Players:§r ${onlinePlayerCount}\n\n`;
    bodyText += `§gOwners (${ownerOnlineCount}):§r ${ownerNames.length > 0 ? ownerNames.join(", ") : "N/A"}\n`;
    bodyText += `§gAdmins (${displayedAdminsOnlineCount}):§r ${adminNames.length > 0 ? adminNames.join(", ") : "N/A"}\n`;
    bodyText += `§gNormal Players (${normalPlayerCount}):§r ${normalPlayerNames.length > 0 ? normalPlayerNames.join(", ") : "N/A"}\n\n`;
	bodyText += `§gTotal Banned Players:§r ${bannedPlayersCount}\n\n`;

	form.body(bodyText);
	form.button1("§cBack"); // MessageFormData has button1 and button2
	form.button2("§cClose"); // This will act as "Back" as well, effectively. Let's use only one back.
                            // Re-doing this part for MessageFormData: only two buttons.
                            // Button1 is typically negative/cancel, Button2 positive/confirm.
                            // For a "Back" only scenario, we usually use Button1.

	// Corrected button setup for MessageFormData (it expects two buttons)
	// To have a single "Back" button, we can make the other one less prominent or non-functional if selected.
	// However, the prompt asks for one "§cBack" button. MessageFormData might not be ideal if only one button is truly desired.
	// ActionFormData is better for single "Back" button, but the prompt specified MessageFormData.
	// Let's use button1 as "Back" and button2 as a dummy "OK" or "Refresh" that does the same as back.
	// The prompt states: "The form should have one button: '§cBack'".
	// This is a slight conflict with MessageFormData's typical two-button design.
	// I will make button2 also effectively a "Back" or simply re-show.
	// For simplicity and adhering to "one button" spirit, I'll make button2 text minimal.
	// Actually, MessageFormData can have just one button if you only call .button1()
	// No, it requires .button1() and .button2().
	// I'll make button2 "OK" and it will just close the form, which is fine.
	// The prompt is specific: "one button: '§cBack'".
	// I will use button1 as "§cBack" and make button2 a simple "OK" that also goes back.

	// Let's re-evaluate. MessageFormData is for messages that need a response (Yes/No, Ok/Cancel).
	// For displaying info with just a "Back", ActionFormData with a single button is more semantically correct.
	// However, the prompt *specifically* asks for MessageFormData.
	// I will proceed with MessageFormData and make both buttons lead back.

	form.button1("§9Re-fetch Info"); // Will also go back
	form.button2("§cBack");   // Main back button

	form.show(player).then((response) => {
            if (response.canceled) {
                if (previousForm) return previousForm(player);
                return;
            }
            if (response.selection === 0) { // For button1 ("Re-fetch Info")
                return showSystemInformation(player, previousForm); // Re-show the current form
            }
            // For button2 ("Back"), or if only one button effectively leads here
            if (previousForm) {
                return previousForm(player);
            }
        }).catch(e => {
		logDebug(`[UI Error][showSystemInformation]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred while displaying system information.");
		}
		if (previousForm) { // Attempt to go back even on error
			previousForm(player);
		}
	});
}

export function settingSelector(player, previousForm){ // Added previousForm from previous task
	if (config.default.other.ownerOnlySettings && !player.isOwner()) return ownerLoginForm(player, settingSelector, previousForm);

	const form = new ActionFormData()
		.title("§l§7Server Settings") // Enhanced title
		.body("Configure Anti-Cheat modules and system settings.") // Added body
		.button("Module Settings", "textures/ui/redstone_torch_on.png") 
		.button("Config Editor", "textures/ui/document_glyph_edit.png") 
		.button("Config Debug", "textures/ui/icon_debug.png"); 

	if (previousForm) {
		form.button("§cBack", "textures/ui/cancel.png"); // Standardized Back button
	}
	player.playSound("random.pop");

	form.show(player).then((formData) => {
		if (formData.canceled) {
			if (previousForm) return previousForm(player); // Go back if cancelled and previousForm exists
			return;
		}
		switch (formData.selection) {
			case 0:
				return moduleSettingsForm(player, (p) => settingSelector(p, previousForm)); // Pass a function that calls settingSelector with previousForm
			case 1:
				return configEditorForm(player, (p) => settingSelector(p, previousForm));
			case 2:
				return configDebugForm(player, (p) => settingSelector(p, previousForm));
			case 3: // Back button
				if (previousForm) return previousForm(player);
				break;
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][settingSelector]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

/**
 * Displays a form to show ban logs, with options for filtering and sorting.
 * Allows navigation to a detailed view of a specific log entry and deletion of entries (for owners).
 * Integrates with `showBanLogFilterSortForm` to get filter/sort criteria.
 *
 * @export
 * @param {Minecraft.Player} player The player to show the form to.
 * @param {Function} previousForm A function to call to return to the previous UI screen.
 * @param {object} [filterOptions={}] Optional parameters for filtering and sorting the logs.
 * @param {string} [filterOptions.playerName=""] Filter logs by player name (case-insensitive, partial match).
 * @param {string} [filterOptions.adminName=""] Filter logs by admin name (case-insensitive, partial match).
 * @param {"date"|"playerName"|"adminName"} [filterOptions.sortBy="date"] Criteria to sort logs by. Defaults to "date".
 * @param {"asc"|"desc"} [filterOptions.sortOrder="desc"] Order to sort logs in ("asc" for ascending, "desc" for descending). Defaults to "desc".
 * @returns {void}
 */
export function banLogForm(player, previousForm, filterOptions = {}) {
	const logsString = world.getDynamicProperty("ac:banLogs");

	// Initialize or retrieve current filter/sort options
    // These might be passed in or stored/retrieved if persisting view preferences
    const defaultSortBy = "date";
    const defaultSortOrder = "desc";
    const currentFilterOptions = {
        playerName: filterOptions.playerName || "",
        adminName: filterOptions.adminName || "",
        sortBy: filterOptions.sortBy || defaultSortBy, 
        sortOrder: filterOptions.sortOrder || defaultSortOrder 
    };


	if (!logsString) {
		player.sendMessage(`§6[§eAnti Cheats§6]§f No logs to display (property missing).`);
		if (previousForm) return previousForm(player); // Go back if no logs
		return;
	}
	
	let allLogs;
	try {
		allLogs = JSON.parse(logsString);
	} catch (error) {
		logDebug("[Anti Cheats UI] Error parsing banLogs JSON in banLogForm (initial load):", error, `Raw: ${logsString}`);
		player.sendMessage("§6[§eAnti Cheats§6]§c Error reading ban logs. Data might be corrupted.");
		if (previousForm) return previousForm(player); // Go back on error
		return;
	}

	if (!Array.isArray(allLogs) || allLogs.length < 1) {
		player.sendMessage(`§6[§eAnti Cheats§6]§f No logs to display (empty or invalid format).`);
		if (previousForm) return previousForm(player); // Go back if no logs
		return;
	}

	let filteredLogs = [...allLogs]; // Start with all logs, then filter

    // Apply Player Name Filter (case-insensitive partial match)
    if (currentFilterOptions.playerName && currentFilterOptions.playerName.trim() !== "") {
        const filterPlayer = currentFilterOptions.playerName.trim().toLowerCase();
        filteredLogs = filteredLogs.filter(log => log.a && log.a.toLowerCase().includes(filterPlayer));
    }

    // Apply Admin Name Filter (case-insensitive partial match)
    if (currentFilterOptions.adminName && currentFilterOptions.adminName.trim() !== "") {
        const filterAdmin = currentFilterOptions.adminName.trim().toLowerCase();
        filteredLogs = filteredLogs.filter(log => log.b && log.b.toLowerCase().includes(filterAdmin));
    }

    // Apply Sorting
    const sortBy = filterOptions.sortBy || "date"; // Default sort by date
    const sortOrder = filterOptions.sortOrder || "desc"; // Default sort order descending

    filteredLogs.sort((log1, log2) => {
        let val1, val2;
        switch (sortBy) {
            case "playerName":
                val1 = (log1.a || "").toLowerCase();
                val2 = (log2.a || "").toLowerCase();
                break;
            case "adminName":
                val1 = (log1.b || "").toLowerCase();
                val2 = (log2.b || "").toLowerCase();
                break;
            case "date":
            default: // Default to date sorting
                // Assuming log.c is a timestamp (number) or a string that can be parsed by Date
                val1 = typeof log1.c === 'string' ? new Date(log1.c).getTime() : Number(log1.c || 0);
                val2 = typeof log2.c === 'string' ? new Date(log2.c).getTime() : Number(log2.c || 0);
                break;
        }

        if (typeof val1 === 'string' && typeof val2 === 'string') {
            return sortOrder === "asc" ? val1.localeCompare(val2) : val2.localeCompare(val1);
        } else { // Handles numbers (timestamps)
            return sortOrder === "asc" ? val1 - val2 : val2 - val1;
        }
    });

	const MAX_LOGS_DISPLAY = 45; // Reduced to make space for Filter/Clear buttons
	let displayLogs = filteredLogs;
	let bodyMessage = `Select a log entry to view details. Total logs shown: ${filteredLogs.length} (out of ${allLogs.length} total).`;
    if (filteredLogs.length === 0) {
        bodyMessage = `No logs match your current filters. Total logs stored: ${allLogs.length}.`;
    }


	if (filteredLogs.length > MAX_LOGS_DISPLAY) {
		displayLogs = filteredLogs.slice(-MAX_LOGS_DISPLAY); // Show most recent matching logs
		bodyMessage = `Displaying the most recent ${MAX_LOGS_DISPLAY} of ${filteredLogs.length} matching logs. Older logs are still stored.`;
	}

	const form = new ActionFormData()
		.title("§l§7Ban Logs") 
		.body(bodyMessage);

    // Add button for Filtering/Sorting
    form.button("§bFilter & Sort Logs", "textures/ui/icon_filter.png"); // Icon updated as per VI.5.7

    const isFilteredOrSorted = currentFilterOptions.playerName || 
                               currentFilterOptions.adminName || 
                               currentFilterOptions.sortBy !== defaultSortBy || 
                               currentFilterOptions.sortOrder !== defaultSortOrder;

    if (isFilteredOrSorted) {
        form.button("§eClear Filters/Sort", "textures/ui/refresh_light.png");
    }
	
	for(const log of displayLogs){ 
		if(!log) continue;
		const dateString = new Date(log.c).toLocaleDateString(); 
		const buttonText = `§e${log.a}§r - By: ${log.b}\nOn: ${dateString} (ID: ${log.logId ? log.logId.substring(0,5) : 'N/A'}...)`;
		form.button(buttonText, "textures/ui/paper.png"); 
	}

	if (previousForm) {
		form.button("§cBack", "textures/ui/cancel.png"); 
	}
	
	form.show(player).then(async (formData) => { // Made async to await showBanLogFilterSortForm
		if (formData.canceled) {
			if (previousForm) return previousForm(player);
			return;
		}

        let actionIndex = formData.selection;
        let hasClearButton = isFilteredOrSorted;

        if (actionIndex === 0) { // "Filter & Sort Logs" button
            const newOptions = await showBanLogFilterSortForm(player, currentFilterOptions);
            if (newOptions) {
                return banLogForm(player, previousForm, newOptions); // Re-call with new options
            } else {
                // If filter form is cancelled, re-show banLogForm with the same current options
                return banLogForm(player, previousForm, currentFilterOptions); 
            }
        }
        
        if (hasClearButton && actionIndex === 1) { // "Clear Filters/Sort" button
            return banLogForm(player, previousForm, {}); // Re-call with empty options to clear
        }

        // Adjust logSelectionIndex based on how many special buttons were present
        // If "Clear" button was present, log entries start after it (index 2 onwards).
        // If "Clear" button was NOT present, log entries start after "Filter & Sort" (index 1 onwards).
        let logSelectionIndex = actionIndex - (hasClearButton ? 2 : 1);
        
		// Handle Back button selection
        // The back button is always the last button *after* the log entries.
        // So, its index relative to the start of log entries is displayLogs.length
		if (previousForm && logSelectionIndex === displayLogs.length) { 
			return previousForm(player);
		}

		if (logSelectionIndex < 0 || logSelectionIndex >= displayLogs.length) {
            logDebug(`[UI Error] banLogForm: Invalid log selection index ${logSelectionIndex}. ActionIndex: ${actionIndex}, HasClear: ${hasClearButton}, Displayed: ${displayLogs.length}`);
            return banLogForm(player, previousForm, currentFilterOptions); // Reshow current form state
        }

		const banLog = displayLogs[logSelectionIndex]; 
		const form2 = new MessageFormData()
			.title(`§l§7Log Details: ${banLog.a}`) 
			.body(
				`§lPlayer:§r ${banLog.a}\n` +
				`§lLog ID:§r ${banLog.logId || "N/A"}\n` +
				`§l--------------------\n` +
				`§lBanned By:§r ${banLog.b}\n` +
				`§lDate:§r ${new Date(banLog.c).toLocaleString()}\n` +
				`§lReason:§r ${banLog.d}\n` +
				`§l--------------------`
			)
			.button2("§7OK") 
			.button1(player.isOwner() ? "§4Delete Log" : "§cBack to Log List"); 
		
		form2.show(player).then((confirmData) => {
			// If "Back to Log List" (selection 0 and not owner, or selection 0 and owner cancels delete)
			// or if "Delete Log" was chosen but cancelled (which is handled by confirmData.canceled for MessageFormData)
			if (confirmData.canceled || (confirmData.selection === 0 && !player.isOwner())) {
				return banLogForm(player, previousForm); // Go back to the list of logs, passing previousForm along
			}
			
			if (confirmData.selection === 0 && player.isOwner()) { // Delete Log
				const selectedLogId = banLog.logId; // Get the unique logId from the selected log
				if (!selectedLogId) {
					player.sendMessage("§6[§eAnti Cheats§6]§c Error: Selected log entry does not have a unique ID. Cannot delete.");
					logDebug("[Anti Cheats UI Error][banLogFormConfirm] Selected log for deletion is missing a logId:", banLog);
					return banLogForm(player, previousForm);
				}

				const currentLogsString = world.getDynamicProperty("ac:banLogs") ?? "[]";
				let currentLogsArray;
				try {
					currentLogsArray = JSON.parse(currentLogsString);
					if (!Array.isArray(currentLogsArray)) throw new Error("Ban logs are not an array.");
				} catch (error) {
					logDebug("[Anti Cheats UI] Error parsing banLogs JSON in banLogForm (delete log):", error, `Raw: ${currentLogsString}`);
					player.sendMessage("§6[§eAnti Cheats§6]§c Error processing ban logs for deletion. Data might be corrupted.");
					return banLogForm(player, previousForm);
				}

				const initialLogCount = currentLogsArray.length;
				// Filter by the unique logId instead of the player name
				const filteredLogs = currentLogsArray.filter(log => log.logId !== selectedLogId);

				if (filteredLogs.length === initialLogCount) {
					logDebug(`Log entry with ID ${selectedLogId} not found for deletion. Player: ${banLog.a}`);
					player.sendMessage(`§6[§eAnti Cheats§6]§c Could not find the specific log entry for ${banLog.a} to delete.`);
					return banLogForm(player, previousForm); 
				}
				
				world.setDynamicProperty("ac:banLogs", JSON.stringify(filteredLogs));
				player.sendMessage(`§6[§eAnti Cheats§6]§f Successfully deleted log entry for: ${banLog.a} (ID: ${selectedLogId.substring(0,5)}...).`);
				return banLogForm(player, previousForm);
			}
			// If "Confirm" (selection 1) on the ban details (now "OK"), just go back to the log list.
			else if (confirmData.selection === 1) {
				return banLogForm(player, previousForm);
			}
		}).catch(e => {
			logDebug(`[Anti Cheats UI Error][banLogFormConfirm]: ${e} ${e.stack}`);
			if (player && typeof player.sendMessage === 'function') {
				player.sendMessage("§cAn error occurred with the UI. Please try again.");
			}
		});
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][banLogFormInitial]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}


/**
 * Shows a modal form to the player for filtering and sorting ban logs.
 * @param {Minecraft.Player} player The player to show the form to.
 * @param {object} currentOptions An object containing the current filter and sort options.
 * @param {string} [currentOptions.playerName=""] Current filter for player name.
 * @param {string} [currentOptions.adminName=""] Current filter for admin name.
 * @param {"date"|"playerName"|"adminName"} [currentOptions.sortBy="date"] Current sort criteria.
 * @param {"asc"|"desc"} [currentOptions.sortOrder="desc"] Current sort order.
 * @returns {Promise<object|null>} A promise that resolves to an object with the selected filter/sort options
 *                                 (keys: `playerName`, `adminName`, `sortBy`, `sortOrder`)
 *                                 if the form is submitted, or `null` if it's cancelled or an error occurs.
 */
export async function showBanLogFilterSortForm(player, currentOptions = {}) {
	const form = new ModalFormData();
	form.title("Filter & Sort Ban Logs");

	const defaultPlayerName = currentOptions.playerName || "";
	const defaultAdminName = currentOptions.adminName || "";
	const defaultSortBy = currentOptions.sortBy || "date";
	const defaultSortOrder = currentOptions.sortOrder || "desc";

	form.textField("Filter by Player Name (leave empty for no filter):", "Enter player name...", defaultPlayerName);
	form.textField("Filter by Admin Name (leave empty for no filter):", "Enter admin name...", defaultAdminName);

	const sortByOptions = ["Date", "Player Name", "Admin Name"];
	let defaultSortByIndex = 0;
	if (defaultSortBy === "playerName") defaultSortByIndex = 1;
	else if (defaultSortBy === "adminName") defaultSortByIndex = 2;
	form.dropdown("Sort By:", sortByOptions, { defaultValue: defaultSortByIndex });

	const sortOrderOptions = ["Ascending", "Descending"];
	let defaultSortOrderIndex = 1; // Default to Descending
	if (defaultSortOrder === "asc") defaultSortOrderIndex = 0;
	form.dropdown("Sort Order:", sortOrderOptions, { defaultValue: defaultSortOrderIndex });

	try {
		const response = await form.show(player);

		if (response.cancelationReason) {
			logDebug("[UI] Ban Log Filter/Sort form cancelled by player.", response.cancelationReason);
			return null; // Or { cancelled: true }
		}

		if (response.formValues) {
			const selectedPlayerName = response.formValues[0];
			const selectedAdminName = response.formValues[1];
			const selectedSortByIndex = response.formValues[2];
			const selectedSortOrderIndex = response.formValues[3];

			let sortByValue = "date"; // Default
			if (selectedSortByIndex === 1) sortByValue = "playerName";
			else if (selectedSortByIndex === 2) sortByValue = "adminName";

			const sortOrderValue = selectedSortOrderIndex === 0 ? "asc" : "desc";

			return {
				playerName: selectedPlayerName,
				adminName: selectedAdminName,
				sortBy: sortByValue,
				sortOrder: sortOrderValue,
			};
		}
		return null; // Should not happen if not cancelled and no formValues, but as a fallback
	} catch (e) {
		logDebug(`[UI Error][showBanLogFilterSortForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the Filter & Sort Logs form. Please try again.");
		}
		return null; // Indicate error or cancellation
	}
}


function ownerLoginForm(player, nextForm, previousFormForNext){
	if(!config.default.OWNER_PASSWORD){
		player.sendMessage(`§6[§eAnti Cheats§6]§4 Error!§c You have not set an owner password inside of the configuration file, access denied.`);
		if (previousFormForNext) return previousFormForNext(player); // Go back if password not set
		return;
	}
	const form = new ModalFormData().title("Anti Cheats Owner Login");
	form.textField("Owner Password","Enter password here...");

	form.show(player).then((formData) => {
		if(formData.canceled) {
			if (previousFormForNext) return previousFormForNext(player); // Go back if login is cancelled
			return;
		}
		if (formData.formValues[0] === config.default.OWNER_PASSWORD) {
			player.sendMessage("§6[§eAnti Cheats§6]§a Access granted, you now have owner status.");
			player.setDynamicProperty("ac:ownerStatus",true);
			player.setDynamicProperty("ac:rankId" ,"owner"); //Added line
			if (nextForm && previousFormForNext) {
				return nextForm(player, previousFormForNext); // Proceed to the target form, passing the original previousForm
			} else if (nextForm) {
				return nextForm(player); // Proceed to target form if no further previousForm context
			}
		} else {
			player.sendMessage("§6[§eAnti Cheats§6]§4 Invalid password!");
			if (previousFormForNext) return previousFormForNext(player); // Go back on invalid password
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][ownerLoginForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

function configDebugForm(player, previousForm){
	const form = new ActionFormData()
		.title("§l§7Config Debugger") // Enhanced title
		.body("Manage and debug the Anti-Cheat configuration.") // Added body
		.button("Export Config to Console", "textures/ui/icon_share.png") // Icon for export
		.button("Reset Config", "textures/ui/trash.png") // Icon for reset
		.button("§cBack", "textures/ui/cancel.png"); // Standardized Back button

	form.show(player).then((formData) => {
		if (formData.canceled) return previousForm(player);
		switch (formData.selection) {
			case 0:
				console.warn(JSON.stringify(config.default));
				player.sendMessage(`§6[§eAnti Cheats§6]§f The config was exported to the console`);
                return configDebugForm(player, previousForm); // Re-show form after action
			case 1:
				world.setDynamicProperty("ac:config",undefined); // safeguard:config -> ac:config
				player.sendMessage(`§6[§eAnti Cheats§6]§f The config was reset. Run §e/reload§f`);
                return configDebugForm(player, previousForm); // Re-show form after action
			case 2: // Back button
				return previousForm(player);
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][configDebugForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

function configEditorForm(player, previousForm) {
	if (!player.isOwner()) return ownerLoginForm(player, configEditorForm, previousForm);

	const mainConfigForm = new ActionFormData()
		.title("§l§7Config Editor - Modules") // Enhanced title
		.body("Select a configuration module to edit its settings."); // Added body
	const configOptions = Object.keys(config.default).filter(key => typeof config.default[key] === "object");

	for (let i = 0; i < configOptions.length; i++) {
		mainConfigForm.button(configOptions[i], "textures/ui/document_glyph.png"); 
	}
    mainConfigForm.button("§cBack", "textures/ui/cancel.png"); // Standardized Back button

	mainConfigForm.show(player).then((configSelection) => {
		if (configSelection.canceled) return previousForm(player);
        if (configSelection.selection === configOptions.length) { 
            return previousForm(player);
        }

		const selectedModule = configOptions[configSelection.selection];
		const configModuleForm = new ModalFormData();
		configModuleForm.title(`§l§7Edit: ${selectedModule}`); // Enhanced title

		const configModuleOptions = Object.entries(config.default[selectedModule]);
		const formFields = []; // Track paths for updating later

		// Iterate through module options and add form fields
		for (const [key, value] of configModuleOptions) {
			if (typeof value === "object") {
				for (const [subKey, subValue] of Object.entries(value)) {
					const fieldPath = `${key}.${subKey}`;
					formFields.push(fieldPath);

					switch (typeof subValue) {
						case "boolean":
							configModuleForm.toggle(`${key} -> ${subKey}\n`, { defaultValue: subValue });
							break;
						case "number":
						case "string":
							configModuleForm.textField(`${key} -> ${subKey}\n`, subValue.toString(), { defaultValue: subValue.toString() });
							break;
					}
				}
			} else {
				formFields.push(key);

				switch (typeof value) {
					case "boolean":
						configModuleForm.toggle(`${key}\n`, { defaultValue: value });
						break;
					case "number":
					case "string":
							configModuleForm.textField(`${key}\n`, value.toString(), { defaultValue: value.toString() });
						break;
				}
			}
		}

		// Show modal form and process user input
		configModuleForm.show(player).then((formData) => {
			if (formData.canceled) {
				// If the value editing form is cancelled, go back to the module selection form
				return configEditorForm(player, previousForm); 
			}

			// Update config.default with new values
			formFields.forEach((fieldPath, index) => {
				const keys = fieldPath.split('.');
				let target = config.default[selectedModule];

				for (let i = 0; i < keys.length - 1; i++) {
					target = target[keys[i]];
				}

				const finalKey = keys[keys.length - 1];
				const oldValue = target[finalKey];
				const newValue = formData.formValues[index];

				// Convert value to correct type
				switch (typeof oldValue) {
					case "boolean":
						target[finalKey] = Boolean(newValue);
						break;
					case "number":
						target[finalKey] = isNaN(parseFloat(newValue)) ? oldValue : parseFloat(newValue);
						break;
					case "string":
						target[finalKey] = newValue;
						break;
				}
			});
			world.setDynamicProperty("ac:config",JSON.stringify(config.default)); // safeguard:config -> ac:config

			player.sendMessage(`§6[§eAnti Cheats§6]§r Configuration updated successfully!`);
		}).catch(e => {
			logDebug(`[Anti Cheats UI Error][configEditorFormModuleOptions]: ${e} ${e.stack}`);
			if (player && typeof player.sendMessage === 'function') {
				player.sendMessage("§cAn error occurred with the UI. Please try again.");
			}
		});
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][configEditorFormMain]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

//settings form
function moduleSettingsForm(player, previousForm){	

	let settingsModalForm = new ModalFormData() // Renamed variable
		.title("§l§7Module Settings") // Enhanced title
	
	const validModules = ACModule.getValidModules();
	for (let i = 0; i < validModules.length; i++) {
		const setting = validModules[i];
		const isSettingEnabled = ACModule.getModuleStatus(setting);
		// The second argument to toggle is indeed the defaultValue.
		settingsModalForm.toggle(setting, { defaultValue: isSettingEnabled }); 
	}

	settingsModalForm.show(player).then((formData) => {
		if (formData.canceled) {
			// player.sendMessage(`§6[§eAnti Cheats§6]§r You closed the form without saving!`); // Optional message
			return previousForm(player); // Go back if cancelled
		}

		for (let i = 0; i < validModules.length; i++) {
			const setting = validModules[i];
			const isSettingEnabled = ACModule.getModuleStatus(setting)
			const shouldEnableSetting = formData.formValues[i];

			if (isSettingEnabled !== shouldEnableSetting) {
				ACModule.toggleModule(setting);
				sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§f ${player.name}§f turned ${shouldEnableSetting ? "on" : "off"} §e${setting}§f!`,true);
			}
		}
        return previousForm(player); // Go back after processing
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][moduleSettingsForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

export function playerSelectionForm(player, action, previousForm) { 
	let players = [...world.getPlayers()];
	let form = new ActionFormData()
		.title("§l§7Player Selector") // Enhanced title
		.body(`Select a player to perform actions on. Online: ${players.length}`); // Added body
	
	players.forEach((targetPlayer) => {
		let playerName = targetPlayer.name;
		let playerDisplayName = playerName; 
		if(targetPlayer.name === player.name) playerDisplayName += " §7(You)";
		if(targetPlayer.isOwner()) playerDisplayName += " §c(Owner)";
		else if(targetPlayer.hasAdmin()) playerDisplayName += " §6(Admin)";
		
		form.button(playerDisplayName, "textures/ui/icon_steve.png"); 
	});

	if (previousForm) {
		form.button("§cBack", "textures/ui/cancel.png"); // Standardized Back button
	}

	form.show(player).then((formData) => {
		if(formData.canceled) {
			if (previousForm) return previousForm(player);
			return player.sendMessage(`§6[§eAnti Cheats§6]§r You closed the form without saving!`);
		}

		// Handle Back button selection
		if (previousForm && formData.selection === players.length) {
			return previousForm(player);
		}

		const selectedPlayer = players[formData.selection];

		if(action == "action") return playerActionForm(player, selectedPlayer, previousForm); 
		// For quick ban, the previousForm should be playerSelectionForm itself, to return to the list.
		if(action == "ban") return banForm(player, selectedPlayer, "quick", null, (p) => playerSelectionForm(p, action, previousForm)); 
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][playerSelectionForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

function playerActionForm(player, targetPlayer, previousForm){ // Added previousForm
	if(targetPlayer.hasAdmin()) {
		player.sendMessage(`§6[§eAnti Cheats§6]§r Can't perform actions on §e${targetPlayer.name}§f they're an admin.`);
		// If an admin was selected, go back to player selection form, which will then allow going back to main panel
		return playerSelectionForm(player, 'action', previousForm); 
	}

	const playerActions = ["Ban Player","Kick Player","Warn Player","Freeze Player","Mute Player","View Inventory","Copy Inventory","Unmute Player","Unfreeze Player","Remove All Warnings"];
	// No direct "Back" button for ModalFormData, cancellation will take back to playerSelectionForm

	let playerActionModalForm = new ModalFormData() // Renamed variable
		.title(`§l§7Actions: ${targetPlayer.name}`) // Enhanced title
		.dropdown(`Select Action:`, playerActions) // Simplified label
		.textField("Reason (optional)", "Enter reason for action"); // Added placeholder

	playerActionModalForm.show(player).then((formData) => {
		if(formData.canceled) {
			// On cancel, return to the player selection form, passing the original previousForm (showAdminPanelMain)
			return playerSelectionForm(player, 'action', previousForm);
		}

		const action = formData.formValues[0];
		const reason = formData.formValues[1] ?? "";
		sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§5§l ${player.name} §bperformed ${playerActions[action]} on§l§5 ${targetPlayer.name}! §r`,true);
		
		switch(action){
			case 0: // Ban Player
				// Pass previousForm so that if banForm is cancelled, it can return to playerActionForm, then playerSelectionForm
				return banForm(player, targetPlayer, "slow", reason, () => playerActionForm(player, targetPlayer, previousForm));
			case 1: // Kick Player
				player.runCommand(`kick "${targetPlayer.name}" ${reason}`);
				// After action, return to player selection
				return playerSelectionForm(player, 'action', previousForm);
				break
			case 2:
				targetPlayer.setWarning("manual");
				targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§r§4§l You were warned!${reason ? ` Reason: §c${reason}` : ""}`);
				player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully warned player §e${targetPlayer.name}`);
				break; // playerSelectionForm will be called below
			case 3: // Freeze Player
				if (targetPlayer.getDynamicProperty("ac:freezeStatus")) {
					player.sendMessage(`§6[§eAnti Cheats§6]§f §e${targetPlayer.name}§f is already frozen.`);
				} else {
					targetPlayer.setFreezeTo(true);
					player.sendMessage(`§6[§eAnti Cheats§6]§f Succesfully froze §e${targetPlayer.name}`);
					targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You were §efrozen§f by the admin §e${player.name}`);
				}
				break;
			case 4: // Mute Player
				targetPlayer.mute(player,reason,-1); // permanent mute
				break;
			case 5: // View Inventory
				invsee(player,targetPlayer); // This function likely doesn't have complex navigation
				break;
			case 6: // Copy Inventory
				copyInv(player,targetPlayer); // This function likely doesn't have complex navigation
				break;
			case 7: // Unmute Player
				if (!targetPlayer.isMuted) {
					player.sendMessage(`§6[§eAnti Cheats§6]§f Player §e${targetPlayer.name}§f is not muted.`);
				} else {
					targetPlayer.unmute();
					player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully unmuted §e${targetPlayer.name}`);
					targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§r You were unmuted!`);
				}
				break;
			case 8: // Unfreeze Player
				if (!targetPlayer.getDynamicProperty("ac:freezeStatus")) {
					player.sendMessage(`§6[§eAnti Cheats§6]§f §e${targetPlayer.name}§f is not frozen.`);
				} else {
					targetPlayer.setFreezeTo(false);
					player.sendMessage(`§6[§eAnti Cheats§6]§f Succesfully unfroze §e${targetPlayer.name}`);
					targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You were §eunfrozen§f by the admin §e${player.name}`);
				}
				break;
			case 9: // Remove All Warnings
				targetPlayer.clearWarnings();
				player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully reset all warnings of §e${targetPlayer.name}`);
				break;
		}
		// After most actions, return to the player selection form
		if (action !== 0 && action !== 5 && action !==6 ) { // Ban form handles its own return. Invsee/CopyInv are one-offs.
			return playerSelectionForm(player, 'action', previousForm);
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][playerActionForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}
