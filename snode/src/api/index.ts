import { Router } from 'express';

import pushMessaging from './routes/pushMessaging';

// guaranteed to get dependencies
export default () => {
    const app = Router();

    // -- HELPERS
    // For mailing route
    pushMessaging(app);
    console.log("pushMessaging loaded");

    // Finally return app
    return app;
};
