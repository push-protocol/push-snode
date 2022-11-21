import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';

interface nodeurl {
    nsid: string;
    nsname: string;
}

@Controller("/kv/v1")
export class UsersController {
    @Get("/nsid/:id/nsname/:name")
    findAll(@Param() params:nodeurl): any {
        const nodeidexists = db.checkIfNodeExists(params.nsid,params.nsname);
        if(nodeidexists) {
            const sql= db.getNodeUrl(params.nsid);
            return {status: "ok", message: "node exists", data: sql};
        }
        else {
            return {status: "error", message: "node does not exist"};
        }
    }
}