import { createDefaultRubric } from "../services/dataBaseService.js";
import { defaultRubric } from "../common/types.js";

async function test() {
  await createDefaultRubric(defaultRubric);
}
test();
