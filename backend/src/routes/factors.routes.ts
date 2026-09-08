import { Router } from 'express';
import { FactorsController } from '../controllers/factors.controller';

const router = Router();

router.get('/', FactorsController.getAll);
router.get('/:id', FactorsController.getById);

export default router;
