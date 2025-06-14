"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const config = __importStar(require("../config/config.json"));
class raidTimeToy {
    // ANSI color codes
    colors = {
        green: '\x1b[32m',
        cyan: '\x1b[36m',
        yellow: '\x1b[33m',
        reset: '\x1b[0m'
    };
    // Map ID to friendly name lookup
    getMapName(mapId) {
        const mapNames = {
            "factory4_day": "Factory (Day)",
            "factory4_night": "Factory (Night)",
            "bigmap": "Customs",
            "woods": "Woods",
            "shoreline": "Shoreline",
            "interchange": "Interchange",
            "rezervbase": "Reserve",
            "laboratory": "The Lab",
            "lighthouse": "Lighthouse",
            "tarkovstreets": "Streets of Tarkov",
            "sandbox": "Ground Zero"
        };
        return mapNames[mapId] || mapId;
    }
    validateConfig() {
        const warnings = [];
        const fixes = [];
        let isValid = true;
        // Create a working copy we can safely modify
        const safeConfig = {
            enabled: config.enabled !== false,
            raidTimeMultiplier: config.raidTimeMultiplier,
            globalMultiplier: config.globalMultiplier,
            randomMode: { ...config.randomMode },
            categories: { ...config.categories },
            perMapSettings: { ...config.perMapSettings }
        };
        // 1. Check basic multiplier
        if (safeConfig.raidTimeMultiplier <= 0) {
            warnings.push(`raidTimeMultiplier (${safeConfig.raidTimeMultiplier}) must be positive`);
            fixes.push(`Setting raidTimeMultiplier to 1.0`);
            safeConfig.raidTimeMultiplier = 1.0;
        }
        if (safeConfig.raidTimeMultiplier > 10) {
            warnings.push(`raidTimeMultiplier (${safeConfig.raidTimeMultiplier}) is very high (>10x)`);
            fixes.push(`Consider using a lower value for realistic gameplay`);
        }
        // 2. Check random mode ranges
        if (safeConfig.randomMode?.enabled) {
            const min = safeConfig.randomMode.minMultiplier;
            const max = safeConfig.randomMode.maxMultiplier;
            if (min <= 0 || max <= 0) {
                warnings.push(`Random multipliers must be positive (min: ${min}, max: ${max})`);
                fixes.push(`Setting random range to 1.0 - 3.0`);
                safeConfig.randomMode.minMultiplier = 1.0;
                safeConfig.randomMode.maxMultiplier = 3.0;
            }
            if (min >= max) {
                warnings.push(`Random min (${min}) must be less than max (${max})`);
                fixes.push(`Swapping min and max values`);
                safeConfig.randomMode.minMultiplier = max;
                safeConfig.randomMode.maxMultiplier = min;
            }
        }
        // 3. Check category multipliers
        for (const [catName, catData] of Object.entries(safeConfig.categories || {})) {
            const category = catData;
            if (category.multiplier <= 0) {
                warnings.push(`Category "${catName}" has invalid multiplier (${category.multiplier})`);
                fixes.push(`Setting "${catName}" multiplier to 1.0`);
                category.multiplier = 1.0;
            }
        }
        // 4. Check per-map settings
        for (const [mapId, multiplier] of Object.entries(safeConfig.perMapSettings || {})) {
            const mult = multiplier;
            if (mult <= 0) {
                warnings.push(`Per-map setting "${mapId}" has invalid multiplier (${mult})`);
                fixes.push(`Setting "${mapId}" multiplier to 1.0`);
                safeConfig.perMapSettings[mapId] = 1.0;
            }
        }
        return { isValid, warnings, fixes, safeConfig };
    }
    logBox(title, content, summary) {
        const { green, cyan, yellow, reset } = this.colors;
        console.log(`${green}┌───────────────────────────────────────────────────────────┐${reset}`);
        console.log(`${green}│${cyan} ${title.padEnd(57)} ${green}│${reset}`);
        console.log(`${green}├───────────────────────────────────────────────────────────┤${reset}`);
        content.forEach(line => {
            console.log(`${green}│${reset} ${line.padEnd(57)} ${green}│${reset}`);
        });
        console.log(`${green}├───────────────────────────────────────────────────────────┤${reset}`);
        console.log(`${green}│${yellow} ${summary.padEnd(56)} ${green}│${reset}`);
        console.log(`${green}└───────────────────────────────────────────────────────────┘${reset}`);
        console.log(''); // Gap at bottom
    }
    postDBLoad(container) {
        const databaseServer = container.resolve("DatabaseServer");
        const locations = databaseServer.getTables().locations;
        let modifiedCount = 0;
        const modificationLogs = [];
        // Exit early if mod is disabled
        if (!config.enabled) {
            console.log(`${this.colors.yellow}🚫 raidTimeToy is disabled in config${this.colors.reset}`);
            return;
        }
        // Validate configuration
        const validation = this.validateConfig();
        const safeConfig = validation.safeConfig;
        // Show validation warnings if any
        if (validation.warnings.length > 0) {
            console.log(`${this.colors.yellow}⚠️  raidTimeToy Configuration Issues:${this.colors.reset}`);
            validation.warnings.forEach(warning => {
                console.log(`${this.colors.yellow}   • ${warning}${this.colors.reset}`);
            });
            validation.fixes.forEach(fix => {
                console.log(`${this.colors.cyan}   → ${fix}${this.colors.reset}`);
            });
            console.log('');
        }
        // Maps to skip (duplicates, variants, etc.)
        const excludedMaps = [
            "sandbox_high", // Duplicate of sandbox
            // Add other problematic maps here if needed
        ];
        // Friendly warning for conflicting settings
        if (safeConfig.randomMode?.enabled && safeConfig.globalMultiplier) {
            console.log('');
            console.log(`${this.colors.yellow}⚠️  raidTimeToy: Both random and global modes enabled - using random mode${this.colors.reset}`);
            console.log('');
        }
        for (const [mapId, mapData] of Object.entries(locations)) {
            const locationData = mapData;
            if (excludedMaps.includes(mapId)) {
                continue;
            }
            if (locationData.base?.EscapeTimeLimit && locationData.base.EscapeTimeLimit < 99999) {
                const oldTime = locationData.base.EscapeTimeLimit;
                // Determine multiplier based on mode
                let multiplier = safeConfig.raidTimeMultiplier; // Default fallback
                let isRandom = false;
                let isGlobal = false;
                let isCategory = false;
                let categoryName = "";
                // Check modes in priority order
                if (safeConfig.randomMode?.enabled) {
                    // Mode 1: Random chaos!
                    const min = safeConfig.randomMode.minMultiplier;
                    const max = safeConfig.randomMode.maxMultiplier;
                    multiplier = Math.random() * (max - min) + min;
                    multiplier = Math.round(multiplier * 100) / 100;
                    isRandom = true;
                }
                else if (safeConfig.globalMultiplier) {
                    // Mode 2: Simple global multiplier
                    multiplier = safeConfig.raidTimeMultiplier;
                    isGlobal = true;
                }
                else {
                    // Mode 3: Check individual settings first
                    const perMapMultiplier = safeConfig.perMapSettings?.[mapId];
                    multiplier = perMapMultiplier !== undefined ? perMapMultiplier : safeConfig.raidTimeMultiplier;
                    if (perMapMultiplier !== undefined) {
                        // Individual setting wins
                        multiplier = perMapMultiplier;
                    }
                    else {
                        // Mode 4: Check categories
                        let foundInCategory = false;
                        const categories = safeConfig.categories || {};
                        for (const [catName, catData] of Object.entries(categories)) {
                            const category = catData;
                            if (category.maps && category.maps.includes(mapId)) {
                                multiplier = category.multiplier;
                                isCategory = true;
                                categoryName = catName;
                                foundInCategory = true;
                                break;
                            }
                        }
                        if (!foundInCategory) {
                            // Mode 5: Default fallback
                            multiplier = safeConfig.raidTimeMultiplier;
                        }
                    }
                }
                const newTime = Math.round(oldTime * multiplier);
                locationData.base.EscapeTimeLimit = newTime;
                const friendlyName = this.getMapName(mapId);
                // Build log message based on mode
                if (isRandom) {
                    modificationLogs.push(`${friendlyName}: 🎲 randomized!`);
                }
                else if (isGlobal) {
                    modificationLogs.push(`${friendlyName}: ${oldTime}m → ${newTime}m (${multiplier}x)`);
                }
                else if (isCategory) {
                    modificationLogs.push(`${friendlyName}: ${oldTime}m → ${newTime}m (${multiplier}x 📂 ${categoryName})`);
                }
                else {
                    const isCustom = safeConfig.perMapSettings?.[mapId] !== undefined;
                    const multiplierText = isCustom ? `${multiplier}x*` : `${multiplier}x`;
                    modificationLogs.push(`${friendlyName}: ${oldTime}m → ${newTime}m (${multiplierText})`);
                }
                modifiedCount++;
            }
        }
        let titleText;
        let summaryText;
        if (config.randomMode?.enabled) {
            titleText = `🎮 raidTimeToy v1.0 - Random Mode 🎲`;
            summaryText = `✅ Randomized ${modifiedCount} maps successfully!`;
        }
        else if (safeConfig.globalMultiplier) {
            titleText = `🎮 raidTimeToy v1.0 - Global Mode (${config.raidTimeMultiplier}x)`;
            summaryText = `✅ Applied ${config.raidTimeMultiplier}x to ${modifiedCount} maps!`;
        }
        else {
            titleText = `🎮 raidTimeToy v1.0 - Custom Mode`;
            summaryText = `✅ Modified ${modifiedCount} maps (* = custom, 📂 = category)`;
        }
        this.logBox(titleText, modificationLogs, summaryText);
    }
}
module.exports = { mod: new raidTimeToy() };
//# sourceMappingURL=mod.js.map