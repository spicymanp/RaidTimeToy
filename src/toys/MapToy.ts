import { DependencyContainer } from "tsyringe";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { RaidTimeToyConfig } from "../controllers/ConfigController";

export class MapToy {
    private container: DependencyContainer;
    private logger: ILogger;
    private db: DatabaseService;

    private colors = {
        green: "\x1b[32m",
        cyan: "\x1b[36m",
        yellow: "\x1b[33m",
        reset: "\x1b[0m",
        magenta: "\x1b[35m",
    };

    constructor(container: DependencyContainer) {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.db = container.resolve<DatabaseService>("DatabaseService");
    }

    /**
     * The main method to adjust all map locations based on the config.
     * @param safeConfig The validated configuration object.
     * @param modVersion The current version of the mod.
     */
    public adjustMaps(safeConfig: RaidTimeToyConfig, modVersion: string): void {
        const locations = this.db.getTables().locations;
        let modifiedMapCount = 0;
        const modificationLogs: string[] = [];

        const excludedMaps = ["sandbox_high"];

        for (const [mapId, mapData] of Object.entries(locations)) {
            const locationData = mapData as any;
            if (excludedMaps.includes(mapId)) {
                continue;
            }
            if (
                locationData.base?.EscapeTimeLimit &&
                locationData.base.EscapeTimeLimit < 99999
            ) {
                // --- Core Raid Time Logic
                const originalRaidTimeMinutes = locationData.base.EscapeTimeLimit;

                let multiplier: number = safeConfig.raidTimeMultiplier;
                let isRandom = false;
                let isGlobal = false;
                let isCategory = false;
                let categoryName = "";

                // Determine multiplier based on configured mode
                if (safeConfig.randomMode?.enabled) {
                    const min = safeConfig.randomMode.minMultiplier;
                    const max = safeConfig.randomMode.maxMultiplier;
                    multiplier = Math.random() * (max - min) + min;
                    multiplier = Math.round(multiplier * 100) / 100;
                    isRandom = true;
                } else if (safeConfig.globalMultiplier) {
                    multiplier = safeConfig.raidTimeMultiplier;
                    isGlobal = true;
                } else {
                    const perMapMultiplier = safeConfig.perMapSettings?.[mapId];
                    if (perMapMultiplier !== undefined) {
                        multiplier = perMapMultiplier;
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
                            multiplier = safeConfig.raidTimeMultiplier;
                        }
                    }
                }


                const newCalculatedRaidTimeMinutes = Math.round(originalRaidTimeMinutes * multiplier);
                locationData.base.EscapeTimeLimit = newCalculatedRaidTimeMinutes;

                const friendlyMapName = this.getMapName(mapId);

                // --- Build core log message for raid time adjustment
                let raidTimeLogMessage = "";
                if (isRandom) {
                    raidTimeLogMessage = `${friendlyMapName}: 🎲 randomized!`;
                } else if (isGlobal) {
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTimeMinutes}m → ${newCalculatedRaidTimeMinutes}m (${multiplier}x)`;
                } else if (isCategory) {
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTimeMinutes}m → ${newCalculatedRaidTimeMinutes}m (${multiplier}x 📂 ${categoryName})`;
                } else {
                    const isCustom = safeConfig.perMapSettings?.[mapId] !== undefined;
                    const multiplierText = isCustom ? `${multiplier}x*` : `${multiplier}x`;
                    raidTimeLogMessage = `${friendlyMapName}: ${originalRaidTimeMinutes}m → ${newCalculatedRaidTimeMinutes}m (${multiplierText})`;
                }
                modificationLogs.push(raidTimeLogMessage);

                // --- TRAIN ADJUSTMENT LOGIC (Train properties are in SECONDS in DB) ---
                if (safeConfig.adjustTrainTimes?.enabled && locationData.base?.exits) {
                    const trainExit = locationData.base.exits.find(
                        (exit: any) => exit.Name === "EXFIL_Train"
                    );

                    if (trainExit) {
                        const trainConfig = safeConfig.adjustTrainTimes;

                        // Convert new raid time from MINUTES to SECONDS for train calculations (which expect seconds).
                        const newCalculatedRaidTimeSeconds = newCalculatedRaidTimeMinutes * 60;

                        const calculatedTrainMinTimeSeconds = Math.round(newCalculatedRaidTimeSeconds * trainConfig.arrivalStartPercent);
                        const calculatedTrainMaxTimeSeconds = Math.round(newCalculatedRaidTimeSeconds * trainConfig.departureEndPercent);

                        trainExit.MinTime = calculatedTrainMinTimeSeconds; // DB expects SECONDS
                        trainExit.MaxTime = calculatedTrainMaxTimeSeconds; // DB expects SECONDS
                        trainExit.Count = trainConfig.trainWaitTimeSeconds; // Config is in SECONDS for DB
                        trainExit.ExfiltrationTime = trainConfig.exfiltrationDurationSeconds; // Config is in SECONDS for DB

                        // Build train log messages (convert seconds to MINUTES for display)
                        if (trainConfig.debugTrainTimes) {
                            modificationLogs.push(
                                `${this.colors.magenta}─────────────────────────────────────────────${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   🚆 TRAIN DEBUG FOR ${friendlyMapName} 🚆${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> Target Raid Length: ${newCalculatedRaidTimeMinutes}m (${newCalculatedRaidTimeSeconds}s)${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> Arrival %: ${trainConfig.arrivalStartPercent}, Departure %: ${trainConfig.departureEndPercent}${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> MinTime (DB): ${calculatedTrainMinTimeSeconds}s (~${Math.round(calculatedTrainMinTimeSeconds / 60)}m)${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> MaxTime (DB): ${calculatedTrainMaxTimeSeconds}s (~${Math.round(calculatedTrainMaxTimeSeconds / 60)}m)${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> Train Wait (DB): ${trainConfig.trainWaitTimeSeconds}s (~${trainConfig.trainWaitTimeSeconds}m)${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}   -> Player Exfil (DB): ${trainConfig.exfiltrationDurationSeconds}s${this.colors.reset}`
                            );
                            modificationLogs.push(
                                `${this.colors.magenta}─────────────────────────────────────────────${this.colors.reset}`
                            );
                        } else {

                            modificationLogs.push(
                                `   -> 🚆 Train: Active ${Math.round(calculatedTrainMinTimeSeconds / 60)}m - ${Math.round(calculatedTrainMaxTimeSeconds / 60)}m (Waits ${Math.round(trainConfig.trainWaitTimeSeconds / 60)}m)`
                            );
                        }
                    }
                }
                modifiedMapCount++;
            }
        }

        // --- Final Logging Box Output ---
        let titleText: string;
        let summaryText: string;

        if (safeConfig.randomMode?.enabled) {
            titleText = `🎮 RaidTimeToy v${modVersion} - Random Mode 🎲`;
            summaryText = `✅ Randomized ${modifiedMapCount} maps successfully!`;
        } else if (safeConfig.globalMultiplier) {
            titleText = `🎮 RaidTimeToy v${modVersion} - Global Mode (${safeConfig.raidTimeMultiplier}x)`;
            summaryText = `✅ Applied ${safeConfig.raidTimeMultiplier}x to ${modifiedMapCount} maps!`;
        } else {
            titleText = `🎮 RaidTimeToy v${modVersion} - Custom Mode`;
            summaryText = `✅ Modified ${modifiedMapCount} maps (*=custom, 📂=category)`;
        }
        this.logBox(titleText, modificationLogs, summaryText);
    }

    // --- Helper Methods (getMapName, logBox) ---

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
        return mapNames[mapId] || mapId;
    }

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
        console.log("");
    }
}