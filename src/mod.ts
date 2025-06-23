import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod"; // Import individually
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod"; // Import individually
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { ConfigController } from "./controllers/ConfigController";
import { MapToy } from "./toys/MapToy";

class RaidTimeToy implements IPreSptLoadMod, IPostDBLoadMod {
    private logger: ILogger;
    private container: DependencyContainer;
    private configController: ConfigController;
    private mapToy: MapToy;

    /**
     * This method runs BEFORE the database is loaded.
     * We use it to set up our "run after every raid" hook and initial config validation.
     */
    public preSptLoad(container: DependencyContainer): void {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.configController = new ConfigController(this.logger);

        // Validate config and get the safe version.
        const validationResult = this.configController.validateAndGetConfig();
        const safeConfig = validationResult.safeConfig;

        // Display validation warnings/fixes from initial load
        if (validationResult.warnings.length > 0) {
            this.logger.warning("[RaidTimeToy] Initial Configuration Issues detected:");
            validationResult.warnings.forEach((warning) => {
                this.logger.warning(`   • ${warning}`);
            });
            validationResult.fixes.forEach((fix) => {
                this.logger.info(`   → ${fix}`);
            });
        }

        // Exit early if mod is disabled in config - no static router registered.
        if (!safeConfig.enabled) {
            this.logger.info("[RaidTimeToy] Mod is disabled in the config. No changes or routes will be registered.");
            return;
        }

        // Register a static route to re-adjust raid times after every local raid.
        const staticRouter = container.resolve<StaticRouterModService>("StaticRouterModService");
        staticRouter.registerStaticRouter(
            "RaidTimeToy-MatchEnd", // Unique name for our router
            [
                {
                    url: "/client/match/local/end", // SPT-AKI's raid end endpoint
                    action: async (url, info, sessionId, output) => { // <-- Fixed: Added `async` here
                        this.logger.info("[RaidTimeToy] Raid has ended. Re-adjusting raid times for the next match...");
                        this.runAdjustments();
                        return output;
                    },
                },
            ],
            "spt" // The SPT-AKI session ID
        );
    }

    /**
     * This method runs AFTER the database is loaded.
     * It makes the initial raid time adjustments when the server first starts.
     */
    public postDBLoad(container: DependencyContainer): void {
        if (!this.configController?.getConfig().enabled) {
            return;
        }

        this.logger.info("[RaidTimeToy] Server started. Applying initial raid time adjustments...");
        this.runAdjustments();
    }

    /**
     * This central function gets a fresh validated config and tells the MapToy to adjust the maps.
     * It's called on server start and after every raid to apply the latest settings.
     */
    private runAdjustments(): void {
        const safeConfig = this.configController.validateAndGetConfig().safeConfig;

        if (!safeConfig.enabled) {
            this.logger.info("[RaidTimeToy] Adjustments skipped as mod became disabled.");
            return;
        }

        this.mapToy = new MapToy(this.container);
        this.mapToy.adjustMaps(safeConfig);
    }
}

module.exports = { mod: new RaidTimeToy() };