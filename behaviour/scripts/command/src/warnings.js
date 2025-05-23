import { newCommand } from '../handle';
import { getPlayerByName, logDebug } from '../../assets/util';
import { ACModule } from '../../classes/module';

newCommand({
    name: "warnings",
    description: "<player> List the player's warnings",
    run: (data) => {
        const { player, args } = data;
        try {
            const setName = args.slice(1).join(" ").replace(/["@]/g, "").trim();

            const targetPlayer = getPlayerByName(setName);

            if (!targetPlayer) {
                player.sendMessage(`§6[§eAnti Cheats§6]§f Player §e${setName}§f was not found`);
                return;
            }

            if (targetPlayer.hasAdmin()) {
                player.sendMessage(`§6[§eAnti Cheats§6]§f Can't view the warnings of §e${targetPlayer.name}§f, they're an admin.`);
                return;
            }
            player.sendMessage(`§6[§eAnti Cheats§6]§f ${targetPlayer.name} warnings count:`);
            
            const warnings = targetPlayer.getWarnings(); 
            const moduleKeys = ACModule.getValidModules(true);

            player.sendMessage(`§6[§eAnti Cheats§6]§f Manual §eWarnings by Admins§f: §e${warnings["manual"] ?? 0}`)
            for(let i = 0; i < moduleKeys.length; i++){
                player.sendMessage(`§6[§eAnti Cheats§6]§f Module §e${ACModule.Modules[ACModule.getModuleID(moduleKeys[i])]}§f: §e${warnings[ACModule.getModuleID(moduleKeys[i])] ?? 0}`);
            }
        } catch (error) {
            logDebug("[Anti Cheats Command Error][warnings]", error, error.stack);
            if (player) {
                player.sendMessage("§cAn unexpected error occurred while trying to list warnings.");
            }
        }
    }
})