import { scoreboardAction, sendMessageToAllAdmins } from '../../assets/util';
import config from '../../config';
import { newCommand } from '../handle';
import * as Minecraft from "@minecraft/server";

const world = Minecraft.world;

newCommand({
    name:"worldborder",
	description: "<border | remove> Get or set the worldborder",
    run: (data) => {
        const {args,player} = data;
        try {
            const oldBorder = world.getDynamicProperty("ac:worldBorder");
            const border = args[1];

            //no args given, display current world border
            if (!border) {
                player.sendMessage(`§6[§eAnti Cheats§6]§f The current border is §e${oldBorder ?? "not set"}§f.`);
                return;
            }
            
            //user wants to remove the border
            if(border === "remove"){
                if(!oldBorder) {
                    player.sendMessage(`§6[§eAnti Cheats§6]§f The world border is §enot set§f.`);
                    return;
                }
                world.setDynamicProperty("ac:worldBorder",0);
                world.worldBorder = null;

                //notify admins
                sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§e ${player.name} §fremoved the world border! §r`,true);
                player.sendMessage(`§6[§eAnti Cheats§6]§r Removed the world border.`);
                return;
            }
            else if (isNaN(border) || border === "" || Number(border) < config.world.worldborder.minBorderDistance) {
                //arg is invalid
                player.sendMessage(`§6[§eAnti Cheats§6]§f You need to enter a valid number for the border (must be more than ${config.world.worldborder.minBorderDistance}).`);
                return;
            }
            //update world border if everything is valid
            world.setDynamicProperty("ac:worldBorder", Number(border));
            world.worldBorder = Number(border);
            player.sendMessage(`§6[§eAnti Cheats§6]§f Set world border to §e${border}§f blocks.`);
            sendMessageToAllAdmins(`§6[§eAnti Cheats Notify§6]§e ${player.name} §fset the world border to§e ${border}§f blocks! §r`,true);
            
        } catch (error) {
            logDebug("[Anti Cheats Command Error][worldborder]", error, error.stack);
            if (player) {
                player.sendMessage("§cAn unexpected error occurred while managing the world border.");
            }
        }
    }
})