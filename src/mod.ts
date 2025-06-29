import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod"; // Correct: imported individually
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod"; // Correct: imported individually
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { ConfigController, RaidTimeToyConfig } from "./controllers/ConfigController"; // This import is correct
import { MapToy } from "./toys/MapToy";
import * as fs from "fs";
import * as path from "path";

class RaidTimeToy implements IPostDBLoadMod {
    private logger: ILogger;
    private container: DependencyContainer;
    private configController: ConfigController;
    private mapToy: MapToy;
    private version: string;

    /**
     * This method runs AFTER the database is loaded.
     * It makes the initial raid time adjustments when the server first starts.
     */
    public postDBLoad(container: DependencyContainer): void {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.configController = new ConfigController(this.logger);

        // --- Get version from package.json ---
        try {
            const packageJsonPath = path.resolve(__dirname, "../package.json");
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
            this.version = packageJson.version;
        } catch (error) {
            this.logger.error(`[RaidTimeToy] Could not read mod version from package.json: ${error}`);
            this.version = "Unknown"; // Fallback version
        }
        // --- END NEW ---

        // Validate config and get the safe version.
        const validationResult = this.configController.validateAndGetConfig();
        const safeConfig = validationResult.safeConfig;

        // Display validation warnings/fixes from initial load
        if (validationResult.warnings.length > 0) {
            this.logger.warning(`[RaidTimeToy v${this.version}] Configuration Issues detected:`);
            validationResult.warnings.forEach((warning) => {
                this.logger.warning(`   • ${warning}`);
            });
            validationResult.fixes.forEach((fix) => {
                this.logger.info(`   → ${fix}`);
            });
        }

        // Exit if mod is disabled in config - only checked once on server start.
        if (!safeConfig.enabled) {
            this.logger.info(`[RaidTimeToy v${this.version}] Mod is disabled in the config. No changes will be applied.`);
            return;
        }

        this.logger.info(`[RaidTimeToy v${this.version}] Server started. Applying initial raid time and train adjustments...`);
        this.runAdjustments(safeConfig); // Pass safeConfig directly
    }

    /**
     * This function now runs ONCE on server startup.
     * It applies the raid time and train adjustments.
     */
    private runAdjustments(safeConfig: RaidTimeToyConfig): void {
        this.mapToy = new MapToy(this.container); // Initialize MapToy
        this.mapToy.adjustMaps(safeConfig, this.version);
    }
}

module.exports = { mod: new RaidTimeToy() };