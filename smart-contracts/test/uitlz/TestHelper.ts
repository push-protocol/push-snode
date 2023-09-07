import {BigNumber, ContractTransaction} from "ethers";
import {expect, assert} from "chai";
import {ValidatorV1} from "../../typechain-types";
import {Event} from "@ethersproject/contracts/src.ts";

export class TestHelper {

  static hasAllFields(obj: any, sampleObj: any,
                      checkValues: boolean,
                      throwEx: boolean = false): boolean {
    for (const key in sampleObj) {
      if (sampleObj.hasOwnProperty(key)) {
        if (!obj.hasOwnProperty(key)) {
          if (throwEx) {
            throw Error(`missing field ${key}`);
          } else {
            return false;
          }

        }
        let val = obj[key];
        let expectedVal = sampleObj[key];
        // console.log('val is ', val);
        // console.log('expectedval is ', expectedVal);
        // if(val instanceof BigNumber) {
        //     val = val.toString();
        //     expectedVal = expectedVal.toString();
        // }
        if (checkValues/*val != expectedVal*/) {
          assert.deepEqual(val, expectedVal,
            `assert failed: invalid field ${key} with value ${val}, expected ${expectedVal}`);
          return false;
          /*if (throwEx) {
            console.log(`${val.constructor.name} ${expectedVal.constructor.name}`)
            throw Error(`invalid field ${key} with value ${val}, expected ${expectedVal}`);
          } else {
            return false;
          }*/
        }
      }
    }
    return true;
  }

  static async confirmTransaction(tx: ContractTransaction) {
    const receipt = await tx.wait(1);
    expect(receipt.status).to.be.equal(1);
    // console.log('tx logs', receipt.logs);
  }

  static async filterEventsFromTransaction(contract: ValidatorV1, tx: ContractTransaction,
                                           eventName: string): Promise<Event[]> {
    const receipt = await tx.wait();
    return receipt.events.filter((event) => event.event === eventName && event.address === contract.address);
  }

  /**
   * Expects that contract transaction (tx) contains a specified event (sample) at specified index (index)
   */
  static async expectEvent(tx: ContractTransaction, index: number, sample: any) {
    return TestHelper.expectEventEx(tx, "NodeStatusChanged", index, sample);
  }

  static async expectEventFirst(tx: ContractTransaction, sample: any) {
    return TestHelper.expectEventEx(tx, "NodeStatusChanged", 0, sample);
  }

  static async expectEventEx(tx: ContractTransaction, eventName: string, index: number, sample: any) {
    await TestHelper.confirmTransaction(tx);
    const receipt = await tx.wait();
    let fileteredEvents = receipt.events.filter((event) => event.event === eventName /*&& event.address === contract.address*/);
    for (let i = 0; i < fileteredEvents.length; i++) {
      console.log(`event[${i}] -> ${fileteredEvents[i].args}`);
    }
    TestHelper.hasAllFields(fileteredEvents[index].args, sample, true, true);
  }

}