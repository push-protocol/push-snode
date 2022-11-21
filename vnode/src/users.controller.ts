import { Controller, Get, Param } from "@nestjs/common";
import db from './helpers/dbHelper';

interface nodeurl {
    nsid: string;
    nsname: string;
}

@Controller("/vnode/kv/v1")
export class UsersController {
    @Get("/nsid/:nsid/nsname/:nsname")
    async findAll(@Param() params:nodeurl): Promise<any> {
        console.log(params);
        const nodeidexists = await db.checkIfNodeExists((params.nsid).toString(), (params.nsname).toString());
        if(nodeidexists) {
            const sql = await db.checkIfNodeUrlExists((params.nsid).toString());
            if(sql) {
                const nodeurl = db.getNodeUrl((params.nsid).toString());
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