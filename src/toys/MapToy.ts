import { DependencyContainer } from "tsyringe";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { RaidTimeToyConfig } from "../controllers/ConfigController"; // Correct import for config type

export class MapToy {
    private container: DependencyContainer;
    private logger: ILogger;
    private db: DatabaseService;

    // Color codes for console output (keep for logBox)
    private colors = {
        green: "\x1b[32m",
        cyan: "\x1b[36m",
        yellow: "\x1b[33m",
        reset: "\x1b[0m",
        // Magenta is no longer needed for polished logs, but kept here if you want it later.
        // magenta: "\x1b[35m",
    };

    constructor(container: DependencyContainer) {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.db = container.resolve<DatabaseService>("DatabaseService");
    }

    /**
     * The main method to adjust all map locations based on the config.
     * This contains all your v1 raid time and train adjustment logic, now polished.
     * @param safeConfig The validated configuration object.
     */
    public adjustMaps(safeConfig: RaidTimeToyConfig): void {
        const locations = this.db.getTables().locations;
        let modifiedMapCount = 0; // Renamed for clarity: this counts maps where raid time or train was adjusted
        const modificationLogs: string[] = [];

        // Maps to skip (duplicates, variants, etc.)
        const excludedMaps = ["sandbox_high"];

        // Friendly warning for conflicting settings - logged once in mod.ts preSptLoad.
        // No need to repeat here.

        for (const [mapId, mapData] of Object.entries(locations)) {
            const locationData = mapData as any; // Cast to 'any' for easier property access
            if (excludedMaps.includes(mapId)) {
                continue; // Skip excluded maps
            }

            // Only modify maps with an EscapeTimeLimit and not 'infinite' raids (99999)
            if (
                locationData.base?.EscapeTimeLimit &&
                locationData.base.EscapeTimeLimit < 99999
            ) {
                const originalRaidTime = locationData.base.EscapeTimeLimit; // Time in minutes (as per SPT database)

                // --- Determine multiplier based on configured mode (Random, Global, Custom, Category, Default) ---
                let multiplier: number = safeConfig.raidTimeMultiplier; // Default fallback
                let isRandom = false;
                let isGlobal = false;
                let isCategory = false;
                let categoryName = ""; // To store the category name for logging

                // Check modes in priority order based on config priority logic
                if (safeConfig.randomMode?.enabled) {
                    const min = safeConfig.randomMode.minMultiplier;
                    const max = safeConfig.randomMode.maxMultiplier;
                    multiplier = Math.random() * (max - min) + min;
                    multiplier = Math.round(multiplier * 100) / 100; // Round to 2 decimal places
                    isRandom = true;
                } else if (safeConfig.globalMultiplier) {
                    multiplier = safeConfig.raidTimeMultiplier;
                    isGlobal = true;
                } else {
                    const perMapMultiplier = safeConfig.perMapSettings?.[mapId];
                    if (perMapMultiplier !== undefined) {
                        multiplier = perMapMultiplier; // Individual setting wins
                    } else {
                        let foundInCategory = false;
                        const categories = safeConfig.categories || {};
                        for (const [catName, catData] of Object.entries(categories)) {
                            const category = catData as any;
                            if (Array.isArray(category.maps) && category.maps.includes(mapId)) {
                                multiplier = category.multiplier;
                                isCategory = true;
                                categoryName = catName;
                                foundInCategory = true;
                                break;
                            }
                        }
                        if (!foundInCategory) {
                            multiplier = safeConfig.raidTimeMultiplier; // Default fallback
                        }
                    }
                }

                // Apply the new raid time to the database
                const newCalculatedTime = Math.round(originalRaidTime * multiplier);
                locationData.base.EscapeTimeLimit = newCalculatedTime;

                const friendlyMapName = this.getMapName(mapId); // Get readable map name

                // --- Build core log message for raid time adjustment ---
                let raidTimeLogMessage = "";
                if (isRandom) {
                    raidTimeLogMessage = `${friendlyMapName}: 🎲 randomized!`;
                } else if (isGlobal) {
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTime}m → ${newCalculatedTime}m (${multiplier}x)`;
                } else if (isCategory) {
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTime}m → ${newCalculatedTime}m (${multiplier}x 📂 ${categoryName})`;
                } else {
                    const isCustom = safeConfig.perMapSettings?.[mapId] !== undefined;
                    const multiplierText = isCustom ? `${multiplier}x*` : `${multiplier}x`;
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTime}m → ${newCalculatedTime}m (${multiplierText})`;
                }
                modificationLogs.push(raidTimeLogMessage); // Add to our logs

                // --- Train Adjustment Logic ---
                if (safeConfig.adjustTrainTimes?.enabled && locationData.base?.exits) {
                    const trainExit = locationData.base.exits.find(
                        (exit: any) => exit.Name === "EXFIL_Train"
                    ); // Corrected to "EXFIL_Train"

                    if (trainExit) {
                        const trainConfig = safeConfig.adjustTrainTimes; // Shorthand for train config
                        const newMinTime = Math.round(newCalculatedTime * trainConfig.arrivalStartPercent);
                        const newMaxTime = Math.round(newCalculatedTime * trainConfig.departureEndPercent);

                        trainExit.MinTime = newMinTime;
                        trainExit.MaxTime = newMaxTime;
                        trainExit.Count = trainConfig.trainWaitTimeSeconds; // Set train wait time (seconds)
                        trainExit.ExfiltrationTime = trainConfig.exfiltrationDurationSeconds; // Set player exfil duration (seconds)

                        // Add a clean, integrated log message for train adjustments
                        modificationLogs.push(
                            `   -> 🚆 Train: Active ${Math.round(newMinTime)}m - ${Math.round(newMaxTime)}m (Waits ${Math.round(trainConfig.trainWaitTimeSeconds / 60)}m)`
                        );
                    }
                }
                modifiedMapCount++; // Increment count of maps actually modified
            }
        }

        // --- Final Logging Box Output ---
        let titleText: string;
        let summaryText: string;

        if (safeConfig.randomMode?.enabled) {
            titleText = `🎮 RaidTimeToy v2.0 - Random Mode 🎲`;
            summaryText = `✅ Randomized ${modifiedMapCount} maps successfully!`;
        } else if (safeConfig.globalMultiplier) {
            titleText = `🎮 RaidTimeToy v2.0 - Global Mode (${safeConfig.raidTimeMultiplier}x)`;
            summaryText = `✅ Applied ${safeConfig.raidTimeMultiplier}x to ${modifiedMapCount} maps!`;
        } else {
            titleText = `🎮 RaidTimeToy v2.0 - Custom Mode`;
            summaryText = `✅ Modified ${modifiedMapCount} maps (*=custom, 📂=category)`; // Updated summary for clarity
        }
        this.logBox(titleText, modificationLogs, summaryText); // Display the collected logs
    }

    // --- Helper Methods (getMapName, logBox) ---

    // Map ID to friendly name lookup
    private getMapName(mapId: string): string {
        const mapNames: Record<string, string> = {
            factory4_day: "Factory (Day)",
            factory4_night: "Factory (Night)",
            bigmap: "Customs",
            woods: "Woods",
            shoreline: "Shoreline",
            interchange: "Interchange",
            rezervbase: "Reserve",
            laboratory: "The Lab",
            lighthouse: "Lighthouse",
            tarkovstreets: "Streets of Tarkov",
            sandbox: "Ground Zero",
        };
        return mapNames[mapId] || mapId; // Return friendly name or ID if not found
    }

    // Draws the colorful log box in the console
    private logBox(title: string, content: string[], summary: string): void {
        const { green, cyan, yellow, reset } = this.colors;
        console.log(
            `${green}┌───────────────────────────────────────────────────────────┐${reset}`
        );
        console.log(
            `${green}│${cyan} ${title.padEnd(57)} ${green}│${reset}`
        );
        console.log(
            `${green}├───────────────────────────────────────────────────────────┤${reset}`
        );
        content.forEach((line) => {
            console.log(
                `${green}│${reset} ${line.padEnd(57)} ${green}│${reset}`
            );
        });
        console.log(
            `${green}├───────────────────────────────────────────────────────────┤${reset}`
        );
        console.log(
            `${green}│${yellow} ${summary.padEnd(56)} ${green}│${reset}`
        );
        console.log(
            `${green}└───────────────────────────────────────────────────────────┘${reset}`
        );
        console.log(""); // Trailing gap for readability
    }
}