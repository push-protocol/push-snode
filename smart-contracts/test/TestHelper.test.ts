import {expect} from "chai";
import {TestHelper as t} from "./uitlz/TestHelper";

describe("Tests for TestHelper", function () {
  it("testhasfields", async function () {
    const object1 = {
      field1: 'value1',
      field2: 'value2',
      field3: 'value3',
    };

    const object2 = {
      field1: 'value1',
      field2: 'value2',
    };

    expect(t.hasAllFields(
      {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      },
      {
        field1: 'value1',
        field2: 'value2',
      }, false)).to.be.true;

    expect(() => {
      t.hasAllFields({
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      }, {
        field1: 'value_',
        field2: 'value2',
      }, true)
    }).to.throw;

    expect(t.hasAllFields(
      {
        field1: 'value1',
        field2: 'value2',
      },
      {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      },
      true)).to.be.false;

    expect(t.hasAllFields(
      {
        field1: 'value1',
        field2: 'value2',
      },
      {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      },
      false)).to.be.false;
  });
});
