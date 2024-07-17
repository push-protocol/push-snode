import { Router } from 'express';

import {storageRoutes} from './routes/storageRoutes';
import {ExpressUtil} from "../utilz/expressUtil";

// guaranteed to get dependencies
export default () => {
    const app = Router();
    app.use(ExpressUtil.handle);
    storageRoutes(app);
    return app;
};
