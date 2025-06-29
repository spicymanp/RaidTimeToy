import * as config from "../../config/config.json"; // Import your config.json
import { ILogger } from "@spt/models/spt/utils/ILogger"; // Import ILogger

export type RaidTimeToyConfig = typeof config;

export class ConfigController {
    private safeConfig: RaidTimeToyConfig;
    private logger: ILogger;

    constructor(logger: ILogger) {
        this.logger = logger;
        // The initial validation and setup of safeConfig is now done when `validateAndGetConfig` is first called in mod.ts's postDBLoad.
    }

    /**
     * Validates the loaded config file and creates a safe, mutable copy.
     * This method performs all the validation checks and applies fixes directly to `safeConfig`.
     * It also returns validation issues for logging.
     * @returns An object containing isValid status, warnings, fixes applied, and the safe config itself.
     */
    public validateAndGetConfig(): { isValid: boolean; warnings: string[]; fixes: string[]; safeConfig: RaidTimeToyConfig } {
        const warnings: string[] = [];
        const fixes: string[] = [];
        let isValid = true; // Assume valid unless a critical error prevents operation

        // Create a deep working copy of the config from the imported config.json.
        // This prevents modifying the original imported JSON object, which can cause errors.
        this.safeConfig = JSON.parse(JSON.stringify(config));

        // --- Validation Logic ---

        // Friendly warning for conflicting settings (random mode takes precedence)
        if (this.safeConfig.randomMode?.enabled && this.safeConfig.globalMultiplier) {
            warnings.push(`Both randomMode and globalMultiplier are enabled. Random mode will take precedence.`);
            fixes.push(`To use custom/category modes when random mode is off, set "globalMultiplier": false.`);
        }

        // 1. Validate 'raidTimeMultiplier'
        if (this.safeConfig.raidTimeMultiplier === undefined || this.safeConfig.raidTimeMultiplier === null) {
            warnings.push(`'raidTimeMultiplier' is missing or null. Defaulting to 1.0.`);
            fixes.push(`Set 'raidTimeMultiplier' in config.json.`);
            this.safeConfig.raidTimeMultiplier = 1.0;
        } else if (typeof this.safeConfig.raidTimeMultiplier !== 'number' || this.safeConfig.raidTimeMultiplier <= 0) {
            warnings.push(`'raidTimeMultiplier' (${this.safeConfig.raidTimeMultiplier}) must be a positive number.`);
            fixes.push(`Setting 'raidTimeMultiplier' to 1.0.`);
            this.safeConfig.raidTimeMultiplier = 1.0;
        } else if (this.safeConfig.raidTimeMultiplier > 10) {
            warnings.push(`'raidTimeMultiplier' (${this.safeConfig.raidTimeMultiplier}x) is very high.`);
            fixes.push(`Consider a lower value for realistic gameplay. Recommended max is 10.0.`);
        }

        // 2. Validate 'randomMode' settings
        if (this.safeConfig.randomMode?.enabled) {
            const min = this.safeConfig.randomMode.minMultiplier;
            const max = this.safeConfig.randomMode.maxMultiplier;

            if (min === undefined || min === null || max === undefined || max === null || typeof min !== 'number' || typeof max !== 'number') {
                warnings.push(`'randomMode' min/max multipliers are missing or not numbers. Defaulting to 1.0 - 3.0.`);
                fixes.push(`Set 'minMultiplier' and 'maxMultiplier' in config.json.`);
                this.safeConfig.randomMode.minMultiplier = 1.0;
                this.safeConfig.randomMode.maxMultiplier = 3.0;
            } else {
                if (min <= 0 || max <= 0) {
                    warnings.push(`Random multipliers (min: ${min}, max: ${max}) must be positive.`);
                    fixes.push(`Setting random range to 1.0 - 3.0.`);
                    this.safeConfig.randomMode.minMultiplier = 1.0;
                    this.safeConfig.randomMode.maxMultiplier = 3.0;
                } else if (min >= max) {
                    warnings.push(`Random min multiplier (${min}) must be less than max multiplier (${max}).`);
                    fixes.push(`Swapping min and max values.`);
                    const temp = this.safeConfig.randomMode.minMultiplier;
                    this.safeConfig.randomMode.minMultiplier = this.safeConfig.randomMode.maxMultiplier;
                    this.safeConfig.randomMode.maxMultiplier = temp;
                }
            }
        }

        // 3. Validate 'categories'
        const categories = this.safeConfig.categories || {};
        for (const [catName, catData] of Object.entries(categories)) {
            const category = catData as any; // Cast to any for easier property access
            if (category.multiplier === undefined || typeof category.multiplier !== 'number' || category.multiplier <= 0) {
                warnings.push(`Category "${catName}" has an invalid or missing 'multiplier' (${category.multiplier}). Setting to 1.0.`);
                fixes.push(`Ensure 'multiplier' for "${catName}" is a positive number.`);
                category.multiplier = 1.0;
            }
            if (!Array.isArray(category.maps)) {
                warnings.push(`Category "${catName}" has an invalid 'maps' property (must be an array of strings).`);
                fixes.push(`Ignoring 'maps' for category "${catName}" and setting to empty array.`);
                category.maps = []; // Default to empty array to prevent further errors
            }
        }

        // 4. Validate 'perMapSettings'
        const perMapSettings = this.safeConfig.perMapSettings || {};
        for (const [mapId, multiplier] of Object.entries(perMapSettings)) {
            const mult = multiplier as number;
            if (mult === undefined || typeof mult !== 'number' || mult <= 0) {
                warnings.push(`Per-map setting for "${mapId}" has an invalid or missing multiplier (${mult}). Setting to 1.0.`);
                fixes.push(`Ensure multiplier for "${mapId}" is a positive number.`);
                this.safeConfig.perMapSettings[mapId] = 1.0;
            }
        }

        // 5. Validate 'adjustTrainTimes'
        if (this.safeConfig.adjustTrainTimes?.enabled) {
            const trainConfig = this.safeConfig.adjustTrainTimes;
            const arrival = trainConfig.arrivalStartPercent;
            const departure = trainConfig.departureEndPercent;
            const wait = trainConfig.trainWaitTimeSeconds;
            const exfil = trainConfig.exfiltrationDurationSeconds;
            const debug = trainConfig.debugTrainTimes; // Debug flag itself

            if (arrival === undefined || typeof arrival !== 'number' || arrival < 0 || arrival >= 1 ||
                departure === undefined || typeof departure !== 'number' || departure < 0 || departure > 1) {
                warnings.push(`Train time percentages (arrival: ${arrival}, departure: ${departure}) must be numbers between 0 and 1.`);
                fixes.push(`Resetting train percentages to default (0.7, 0.95).`);
                trainConfig.arrivalStartPercent = 0.7;
                trainConfig.departureEndPercent = 0.95;
            } else if (arrival >= departure) {
                warnings.push(`Train arrival percentage (${arrival}) must be less than departure percentage (${departure}).`);
                fixes.push(`Swapping train percentages.`);
                const temp = trainConfig.arrivalStartPercent;
                trainConfig.arrivalStartPercent = trainConfig.departureEndPercent;
                trainConfig.departureEndPercent = temp;
            }

            if (wait === undefined || typeof wait !== 'number' || wait <= 0) {
                warnings.push(`Train wait time (${wait}) must be a positive number of seconds.`);
                fixes.push(`Setting train wait time to 400 seconds.`);
                trainConfig.trainWaitTimeSeconds = 400;
            }
            if (exfil === undefined || typeof exfil !== 'number' || exfil <= 0) {
                warnings.push(`Exfiltration duration (${exfil}) must be a positive number of seconds.`);
                fixes.push(`Setting exfiltration duration to 5 seconds.`);
                trainConfig.exfiltrationDurationSeconds = 5;
            }

            if (debug === undefined || typeof debug !== 'boolean') {
                warnings.push(`'debugTrainTimes' in adjustTrainTimes is missing or not a boolean. Defaulting to false.`);
                fixes.push(`Set 'debugTrainTimes' to true or false in config.json.`);
                trainConfig.debugTrainTimes = false;
            }
        }
        // End Validation Logic

        return { isValid, warnings, fixes, safeConfig: this.safeConfig };
    }

    /**
     * Returns the current validated configuration object.
     * This is typically used by other parts of the mod to access the active settings.
     */
    public getConfig(): RaidTimeToyConfig {
        return this.safeConfig;
    }
}