import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';

interface nodeurl {
    nsid: string;
    nsname: string;
}

@Controller("/vnode/kv/v1")
export class UsersController {
    @Get("/nsid/:id/nsname/:name")
    async findAll(@Param() params:nodeurl): Promise<any> {
        console.log(params);
        const nodeidexists = await db.checkIfNodeExists(params.nsid, params.nsname);
        if(nodeidexists) {
            const sql = await db.checkIfNodeUrlExists(params.nsid);
            if(sql) {
                const nodeurl = db.getNodeUrl(params.nsid);
                return nodeurl;
            }else{
                return 'node url does not exist';
            }
        }
        else {
            return {status: "error", message: "node does not exist"};
        }
    }
}