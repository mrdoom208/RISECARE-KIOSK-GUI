import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import vitalsRouter from "./vitals";
import sensorsRouter from "./sensors";
import settingsRouter from "./settings";
import printRouter from "./print";
import aiRouter from "./ai";
import networkRouter from "./network";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(vitalsRouter);
router.use(sensorsRouter);
router.use("/settings", settingsRouter);
router.use(printRouter);
router.use(aiRouter);
router.use(networkRouter);

export default router;
