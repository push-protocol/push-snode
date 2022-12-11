import axios, {AxiosResponse} from "axios";

export default class SNodeClient {

    async postRecord(baseUri: string, ns: string, nsIndex: string, ts: string, key: string, data: any): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/ts/${ts}/key/${key}`;
        console.log(`postRecord() ${url}`, data);
        let resp = await axios.post(url, data, {timeout: 5000});
        console.log(resp.status);
        return resp;
    }

     async listRecordsByMonth(baseUri: string, ns: string, nsIndex: string, month: string, firstTs?: string): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/month/${month}/list/`;
        if (firstTs != null) {
            url += `?firstTs=${firstTs}`
        }
        let resp = await axios.post(url, {timeout: 3000});
        console.log('listRecordsByMonth', url, resp.status, resp.data);
        return resp;
    }

    async getRecord(baseUri: string, ns: string, nsIndex: string, date: string, key: string): Promise<AxiosResponse> {
        let url = `${baseUri}/api/v1/kv/ns/${ns}/nsidx/${nsIndex}/date/${date}/key/${key}`;
        let resp = await axios.get(url, {timeout: 3000});
        console.log('getRecord() ', url, " ", resp.status, " ", resp.data);
        return resp;
    }
}


