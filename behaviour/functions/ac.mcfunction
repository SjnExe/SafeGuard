# Add necessary scoreboard objectives
scoreboard objectives add ac:vanish dummy
scoreboard objectives add ac:notify dummy
scoreboard objectives add ac:setup_success dummy

# Ensure players have a default value in ac:setup_success
scoreboard players add @a ac:setup_success 0

scoreboard players set @a[scores={ac:setup_success=0..}] ac:gametest_on 0
scoreboard players set @a[scores={ac:setup_success=0,ac:gametest_on=0}] ac:setup_success 2

# Add necessary tags and disable command feedback
tag @s add admin
gamerule sendcommandfeedback false
gamerule commandblockoutput false

# Add tag to NPCs (for future use)
tag @e[type=npc] add ac:friend

tellraw @s[scores={ac:setup_success=3..}] {"rawtext":[{"text":"§6[§eAnti Cheats§6]§r§c§l "},{"text":"SETUP ERROR: §r§4AntiCheat already setup!§r"}]}

playsound random.levelup @s[scores={ac:setup_success=2}]
execute as @s[scores={ac:setup_success=2}] run function credit
tellraw @s[scores={ac:setup_success=2}] {"rawtext":[{"text":"§6[§eAnti Cheats§6]§r Add tag §eadmin§r to all the staff §o/tag NAME add admin§r"}]}
tellraw @s[scores={ac:setup_success=2}] {"rawtext":[{"text":"§6[§eAnti Cheats§6]§r §aSuccessfully setup the anti-cheat!§r"}]}
execute as @s[scores={ac:setup_success=2}] run scoreboard players set @s ac:setup_success 3
#errors
tellraw @s[scores={ac:setup_success=0..1}] {"rawtext":[{"text":"§6[§eAnti Cheats§6]§r§c§l "},{"text":"SETUP ERROR: §r§4Experiments Required, turn on §7Beta APIs§r"}]}

playsound random.anvil_land @s[scores={ac:setup_success=0..1}]
