import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import vitalsRouter from "./vitals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(vitalsRouter);

export default router;
