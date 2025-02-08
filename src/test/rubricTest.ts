import { createDefaultRubric } from "../services/dataBaseService.js";
import { defaultRubric } from "../common/types.js";

//npm run rubric
async function test() {
  await createDefaultRubric(defaultRubric);
}
test();
