import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import sensorsRouter from "./sensors";
import settingsRouter from "./settings";
import accountsRouter from "./accounts";
import powerRouter from "./power";
import updateRouter from "./update";
import printRouter from "./print";
import networkRouter from "./network";
import deviceRouter from "./device";
import systemRouter from "./system";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(sensorsRouter);
router.use("/settings", settingsRouter);
router.use("/settings", accountsRouter);
router.use("/settings", powerRouter);
router.use("/settings", updateRouter);
router.use("/system", systemRouter);
router.use(printRouter);
router.use(networkRouter);
router.use(deviceRouter);

export default router;
