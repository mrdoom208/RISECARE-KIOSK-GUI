import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import vitalsRouter from "./vitals";
import sensorsRouter from "./sensors";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(vitalsRouter);
router.use(sensorsRouter);
router.use("/settings", settingsRouter);

export default router;
