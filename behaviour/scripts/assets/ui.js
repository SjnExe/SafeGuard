import * as Minecraft from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';
import { addPlayerToUnbanQueue, copyInv, getPlayerByName, invsee, logDebug, millisecondTime, sendMessageToAllAdmins } from './util.js';
import { ACModule } from '../classes/module.js';
import * as config from "../config.js";

const world = Minecraft.world;


//ban form
function banForm(player,targetPlayer,type,banReason){
	if(targetPlayer.hasAdmin()) return player.sendMessage(`§6[§eAnti Cheats§6]§r Can't ban §e${targetPlayer.name}§f they're an admin.`);

	if(type == "quick"){
		let confirmF = new MessageFormData()
			.title("Ban Player")
			.body(`Are you sure you want to ban this player:\n${targetPlayer.name}`)
			.button2("Ban")
			.button1("Cancel")
		confirmF.show(player).then((confirmData) => {
			if(confirmData.selection === 1){
				targetPlayer.ban("No reason provided.", Date.now(), true, player);

				targetPlayer.runCommand(`kick "${targetPlayer.name}" §r§6[§eAnti Cheats§6]§r §4You are permanently banned.\n§4Reason: §cNo reason provided\n§4Banned by: §c${player.name}`)
        
				player.sendMessage(`§6[§eAnti Cheats§6]§f Successfully banned §e${targetPlayer.name}`);
				sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§f §e${player.name}§f banned §e${targetPlayer.name}§f!`,true);
				
			}
			else return player.sendMessage(`§6[§eAnti Cheats§6]§f Cancelled`);
		}).catch(e => {
			logDebug(`[Anti Cheats UI Error][banFormQuick]: ${e} ${e.stack}`);
			if (player && typeof player.sendMessage === 'function') {
				player.sendMessage("§cAn error occurred with the UI. Please try again.");
			}
		});
	}
	else if(type=="slow"){
		let banForm = new ModalFormData()
		.title("Anti Cheats Ban Form")
		.slider("Ban Time:\n\nDays",0,360,1,0)
		.slider("Hours",0,23,1,0)
		.slider("Minutes",0,59,1,0)
		.toggle("Permanent", { defaultValue: false})
		banForm.show(player).then((banFormData) => {
			if(banFormData.canceled) return player.sendMessage(`§6[§eAnti Cheats§6]§f Cancelled`);
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

export function unbanForm(player){
	let unbanForm = new ModalFormData()
	.title("Anti Cheats Player Unban")
	.textField("Player Name","Player name to unban (case sensitive)");

	unbanForm.show(player).then((formData) => {
		if (formData.canceled) {
			player.sendMessage(`§6[§eAnti Cheats§6]§r You closed the form without saving!`);
			return;
		}
		const playerName = formData.formValues[0];
		
		addPlayerToUnbanQueue(player,playerName);
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][unbanForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

export function settingSelector(player){
	if (config.default.other.ownerOnlySettings && !player.isOwner()) return ownerLoginForm(player);

	const form = new ActionFormData()
		.title("Anti Cheats Settings")
		.body(`Please select an option from below:`)
		.button("Module Settings")
		.button("Config Editor")
		.button("Config Debug")
		// No "Back" button here as this is the main settings menu.
	player.playSound("random.pop");

	form.show(player).then((formData) => {
		if (formData.canceled) return; // Or handle as needed, maybe go to main UI if there was one.
		switch (formData.selection) {
			case 0:
				return moduleSettingsForm(player, settingSelector);
			case 1:
				return configEditorForm(player, settingSelector);
			case 2:
				return configDebugForm(player, settingSelector);
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][settingSelector]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}
export function banLogForm(player){
	const logsString = world.getDynamicProperty("ac:banLogs");

	if (!logsString) return player.sendMessage(`§6[§eAnti Cheats§6]§f No logs to display (property missing).`);
	
	let newLogs;
	try {
		newLogs = JSON.parse(logsString);
	} catch (error) {
		logDebug("[Anti Cheats UI] Error parsing banLogs JSON in banLogForm (initial load):", error, `Raw: ${logsString}`);
		player.sendMessage("§6[§eAnti Cheats§6]§c Error reading ban logs. Data might be corrupted.");
		return;
	}

	if (!Array.isArray(newLogs) || newLogs.length < 1) return player.sendMessage(`§6[§eAnti Cheats§6]§f No logs to display (empty or invalid format).`);
	

	logDebug(`Trying to create form`); // This log message does not need changing as it's generic
	const form = new ActionFormData()
		.title("Anti Cheats Ban Logs")
		.body(`Select a player to view ban log on:`);
	

	//a - banned persons name
	//b - admin name
	//c - time of ban
	//d - ban reason
	for(const log of newLogs){
		if(!log) continue;
		form.button(log.a);
	}
	

	form.show(player).then((formData) => {
		if (formData.canceled) return;
		const banLog = newLogs[formData.selection];
		const form2 = new MessageFormData()
			.title(`${banLog.a}'s Ban Log`)
			.body(`Info about ${banLog.a}'s ban:\n\n\nBanned by: ${banLog.b}\n\nBan time: ${new Date(banLog.c)}\n\nReason: ${banLog.d}`)
			.button2("Confirm")
			.button1(player.isOwner() ? "Delete Log" : "Cancel"); 
		
		form2.show(player).then((confirmData) => {
			if(confirmData.canceled) return banLogForm(player);
			
			//delete ban log
			if (confirmData.selection === 0 && player.isOwner()) {
				const bannedPerson = banLog.a;

				const currentLogsString = world.getDynamicProperty("ac:banLogs") ?? "[]";
				let currentLogsArray;
				try {
					currentLogsArray = JSON.parse(currentLogsString);
					if (!Array.isArray(currentLogsArray)) throw new Error("Ban logs are not an array.");
				} catch (error) {
					logDebug("[Anti Cheats UI] Error parsing banLogs JSON in banLogForm (delete log):", error, `Raw: ${currentLogsString}`);
					player.sendMessage("§6[§eAnti Cheats§6]§c Error processing ban logs for deletion. Data might be corrupted.");
					return;
				}

				const initialLogCount = currentLogsArray.length;
				const filteredLogs = currentLogsArray.filter(log => log.a !== bannedPerson);

				if (filteredLogs.length === initialLogCount) {
					logDebug(`No log found for banned person: ${bannedPerson}`);
					return;
				}
				world.setDynamicProperty("ac:banLogs", JSON.stringify(filteredLogs));

				player.sendMessage(`§6[§eAnti Cheats§6]§f Successfully deleted log for: ${bannedPerson}`);
			}
			else return banLogForm(player);
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

function ownerLoginForm(player){
	if(!config.default.OWNER_PASSWORD){
		return player.sendMessage(`§6[§eAnti Cheats§6]§4 Error!§c You have not set an owner password inside of the configuration file, access denied.`);
	}
	const form = new ModalFormData().title("Anti Cheats Owner Login");
	form.textField("Owner Password","Enter password here...");

	form.show(player).then((formData) => {
		if(formData.canceled) return;
		if (formData.formValues[0] === config.default.OWNER_PASSWORD) {
			player.sendMessage("§6[§eAnti Cheats§6]§a Access granted, you now have owner status.");
			player.setDynamicProperty("ac:ownerStatus",true); // safeguard:ownerStatus -> ac:ownerStatus (already done but good to confirm)
			settingSelector(player);
		}
		else player.sendMessage("§6[§eAnti Cheats§6]§4 Invalid password!");
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][ownerLoginForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

function configDebugForm(player, previousForm){
	const form = new ActionFormData()
		.title("Anti Cheats Config Debugger")
		.body(`Please select an option from below:`)
		.button("Export Config to Console")
		.button("Reset Config")
		.button("Back"); // Added Back button

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
	if (!player.isOwner()) return ownerLoginForm(player); // Consider passing previousForm here too if login can go back

	const mainConfigForm = new ActionFormData().title("Anti Cheats Config Editor");
	const configOptions = Object.keys(config.default).filter(key => typeof config.default[key] === "object");

	for (let i = 0; i < configOptions.length; i++) {
		mainConfigForm.button(configOptions[i]);
	}
    mainConfigForm.button("Back"); // Add back button to module selection

	mainConfigForm.show(player).then((configSelection) => {
		if (configSelection.canceled) return previousForm(player);
        if (configSelection.selection === configOptions.length) { // Check if "Back" was pressed
            return previousForm(player);
        }

		const selectedModule = configOptions[configSelection.selection];
		const configModuleForm = new ModalFormData();
		configModuleForm.title(`Settings: ${selectedModule}`);

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
							configModuleForm.toggle(`${key} -> ${subKey}\n`, { defaultValue: subValue});
							break;
						case "number":
						case "string":
							configModuleForm.textField(`${key} -> ${subKey}\n`, subValue.toString(), {defaultValue:subValue.toString()});
							break;
					}
				}
			} else {
				formFields.push(key);

				switch (typeof value) {
					case "boolean":
						configModuleForm.toggle(`${key}\n`, { defaultValue: value});
						break;
					case "number":
					case "string":
						configModuleForm.textField(`${key}\n`, value.toString(), {defaultValue:value.toString()});
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

	let settingsform = new ModalFormData()
	.title("Anti Cheats Module Settings");
    // No direct "Back" button for ModalFormData, cancellation will handle it.

	const validModules = ACModule.getValidModules();
	for (let i = 0; i < validModules.length; i++) {
		const setting = validModules[i];
		const isSettingEnabled = ACModule.getModuleStatus(setting);

		settingsform.toggle(setting, {defaultValue:isSettingEnabled});
	}

	settingsform.show(player).then((formData) => {
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

export function playerSelectionForm(player,action){
	let players = [...world.getPlayers()];
	let form = new ActionFormData()
	.title("Anti Cheats Player Selector")
	.body(`Please select a player from ${players.length} online players:`);
	players.forEach((targetPlayer) => {
		let playerName = targetPlayer.name;
		if(targetPlayer.name == player.name) playerName += " (YOU)";
		if(targetPlayer.isOwner()) playerName += " (OWNER)";
		else if(targetPlayer.hasAdmin()) playerName += " (ADMIN)";
		
		form.button(playerName,"textures/ui/icon_steve.png");
	})
	form.show(player).then((formData) => {
		if(formData.canceled) return player.sendMessage(`§6[§eAnti Cheats§6]§r You closed the form without saving!`);
		if(action == "action") return playerActionForm(player,players[formData.selection]);
		if(action == "ban") return banForm(player,players[formData.selection],"quick")
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][playerSelectionForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}

function playerActionForm(player,targetPlayer){
	if(targetPlayer.hasAdmin()) return player.sendMessage(`§6[§eAnti Cheats§6]§r Can't perform actions on §e${targetPlayer.name}§f they're an admin.`);

	const playerActions = ["Ban Player","Kick Player","Warn Player","Freeze Player","Mute Player","View Inventory","Copy Inventory","Unmute Player","Unfreeze Player","Remove All Warnings"];

	let form = new ModalFormData()
	.title(`Anti Cheats Action Selector`)
	.dropdown(`Select an Action for ${targetPlayer.name}:`,playerActions)
	.textField("Reason (optional)","")
	form.show(player).then((formData) => {
		if(formData.canceled) return player.sendMessage(`§6[§eAnti Cheats§6]§r You closed the form without saving!`);

		const action = formData.formValues[0];
		const reason = formData.formValues[1] ?? "";
		sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§5§l ${player.name} §bperformed ${playerActions[action]} on§l§5 ${targetPlayer.name}! §r`,true);
		
		switch(action){
			case 0:
				return banForm(player,targetPlayer,"slow",reason);
			case 1:
				player.runCommand(`kick "${targetPlayer.name}" ${reason}`);
				break
			case 2:
				targetPlayer.setWarning("manual");
				targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§r§4§l You were warned!${reason ? ` Reason: §c${reason}` : ""}`);
				player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully warned player §e${targetPlayer.name}`);
				break;
			case 3:
				if (targetPlayer.getDynamicProperty("ac:freezeStatus")) return player.sendMessage(`§6[§eAnti Cheats§6]§f §e${targetPlayer.name}§f is already frozen.`); // safeguard:freezeStatus -> ac:freezeStatus

				targetPlayer.setFreezeTo(true);
				player.sendMessage(`§6[§eAnti Cheats§6]§f Succesfully froze §e${targetPlayer.name}`);
				targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You were §efrozen§f by the admin §e${player.name}`);
				break;
			case 4:
				//permanent mute
				targetPlayer.mute(player,reason,-1);
				break;
			case 5:
				return invsee(player,targetPlayer);
			case 6:
				return copyInv(player,targetPlayer);
			case 7:
				if (!targetPlayer.isMuted) {
					player.sendMessage(`§6[§eAnti Cheats§6]§f Player §e${targetPlayer.name}§f is not muted.`);
					return;
				}
				targetPlayer.unmute();
				
				player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully unmuted §e${targetPlayer.name}`);
				targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§r You were unmuted!`)
				break;
			case 8:
				if (!targetPlayer.getDynamicProperty("ac:freezeStatus")) return player.sendMessage(`§6[§eAnti Cheats§6]§f §e${targetPlayer.name}§f is not frozen.`); // safeguard:freezeStatus -> ac:freezeStatus

				targetPlayer.setFreezeTo(false);
				player.sendMessage(`§6[§eAnti Cheats§6]§f Succesfully unfroze §e${targetPlayer.name}`);
				targetPlayer.sendMessage(`§6[§eAnti Cheats§6]§f You were §eunfrozen§f by the admin §e${player.name}`);
				break;
			case 9:
				targetPlayer.clearWarnings();
				player.sendMessage(`§6[§eAnti Cheats§6]§r Successfully reset all warnings of §e${targetPlayer.name}`);
				break;
		}
	}).catch(e => {
		logDebug(`[Anti Cheats UI Error][playerActionForm]: ${e} ${e.stack}`);
		if (player && typeof player.sendMessage === 'function') {
			player.sendMessage("§cAn error occurred with the UI. Please try again.");
		}
	});
}
