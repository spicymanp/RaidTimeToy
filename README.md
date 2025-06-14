# RaidTimeToy
A simple raid time tool that allows you to shorten or lengthen your SPT raid times. There's some randomness if you enjoy keeping things mildly spicy. 

## Features

- Global, per-map, category, and random raid time multipliers
- Clean, color-coded console output
- Input validation with helpful warnings
- Easy config, no code editing required

## Installation

1. Download or clone this repo into your SPT `user/mods` folder.
2. Run `npm install` and `npm run build` in the mod folder.
3. Edit `config/config.json` to your liking.
4. Start your SPT-AKI server!

## Configuration

Edit `config/config.json` to control how raid times are set.  
You can use:
- **Global multiplier**: Set all maps to the same value
- **Per-map settings**: Fine-tune individual maps
- **Categories**: Group maps and set multipliers for each group
- **Random mode**: Randomize all raid times each server restart

## How RaidTimeToy Picks Which Multiplier to Use
*When the mod sets the raid time for each map, it checks your config in this order:*

## Random Mode
If randomMode.enabled is true, a random multiplier (between minMultiplier and maxMultiplier) is used for all maps.
This overrides all other settings.

## Global Multiplier
If randomMode.enabled is false and globalMultiplier is true, the value of raidTimeMultiplier is used for all maps.
This overrides per-map and category settings.

## Per-Map Settings
If both randomMode.enabled and globalMultiplier are false, the mod checks if the current map is listed in perMapSettings.
If it is, that value is used for this map.

## Categories
If the map is not in perMapSettings, the mod checks if it’s included in any categories group.
If it is, the category’s multiplier is used.

## Default Multiplier
*If none of the above apply, the mod uses the value of raidTimeMultiplier as a fallback.*



⏩ Priority Table
Setting                                  Used When...

randomMode                       If enabled, always used for all maps
globalMultiplier                    If enabled (and randomMode is off), used for all
perMapSettings                    If set for a map, used for that map
categories                             If map is in a category, used for that map
raidTimeMultiplier                Used only if none of the above apply

⚠️ If Multiple Are Enabled
- Random mode always wins (even if global is also enabled).
- Global wins over per-map and categories.
- Per-map wins over categories.
- Categories win over the default.

Tip:
If you want to use per-map or category settings, make sure both randomMode.enabled and globalMultiplier are set to false.





Example:
```json
{
  "enabled": true,
  "globalMultiplier": false,
  "raidTimeMultiplier": 2.0,
  "randomMode": {
    "enabled": false,
    "minMultiplier": 1.0,
    "maxMultiplier": 3.0
  },
  "categories": {
    "smallMaps": { "multiplier": 0.5, "maps": ["factory4_day", "factory4_night"] },
    "mediumMaps": { "multiplier": 1.5, "maps": ["bigmap", "reservbase", "interchange"] },
    "bigMaps": { "multiplier": 2.5, "maps": ["shoreline", "woods", "lighthouse", "tarkovstreets"] },
    "expensiveMaps": { "multiplier": 3.0, "maps": ["laboratory"] }
  }
},
  "perMapSettings": {
    "factory4_day": 1.5,
    "factory4_night": 2.5,
    "laboratory": 3.0,
    "bigmap": 1.5,
    "woods": 2.0,
    "shoreline": 2.0,
    "interchange": 2.0,
    "reserve": 2.0,
    "lighthouse": 2.0,
    "tarkovstreets": 2.0,
    "sandbox": 2.0
  }
}
```

## Credits

- Mod by SpicyManP
- With guidance and code review by T3 Chat

---