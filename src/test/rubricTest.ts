import {
  createDefaultRubric,
  getRubric,
  newRubric,
} from "../services/dataBaseService.js";

async function test() {
  console.log("go!");
  const a = await getRubric("LVL-0PX2Y");
  console.log(a);
  const b = await getRubric("LVL-0PX2Y");
  console.log(b);
}
test();
