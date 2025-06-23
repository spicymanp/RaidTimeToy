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
                const originalRaidTime = locationData.base.EscapeTimeLimit;

                let multiplier: number = safeConfig.raidTimeMultiplier;
                let isRandom = false;
                let isGlobal = false;
                let isCategory = false;
                let categoryName = "";

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

                const newCalculatedTime = Math.round(originalRaidTime * multiplier);
                locationData.base.EscapeTimeLimit = newCalculatedTime;

                const friendlyMapName = this.getMapName(mapId);

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
                modificationLogs.push(raidTimeLogMessage);

                if (safeConfig.adjustTrainTimes?.enabled && locationData.base?.exits) {
                    const trainExit = locationData.base.exits.find(
                        (exit: any) => exit.Name === "EXFIL_Train"
                    );

                    if (trainExit) {
                        const trainConfig = safeConfig.adjustTrainTimes;
                        const newMinTime = Math.round(newCalculatedTime * trainConfig.arrivalStartPercent);
                        const newMaxTime = Math.round(newCalculatedTime * trainConfig.departureEndPercent);

                        trainExit.MinTime = newMinTime;
                        trainExit.MaxTime = newMaxTime;
                        trainExit.Count = trainConfig.trainWaitTimeSeconds;
                        trainExit.ExfiltrationTime = trainConfig.exfiltrationDurationSeconds;

                        modificationLogs.push(
                            `   -> 🚆 Train: Active ${Math.round(newMinTime)}m - ${Math.round(newMaxTime)}m (Waits ${Math.round(trainConfig.trainWaitTimeSeconds / 60)}m)`
                        );
                    }
                }
                modifiedMapCount++;
            }
        }

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