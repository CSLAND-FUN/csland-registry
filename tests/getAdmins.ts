import { getAdmins } from "../src/functions/Admins";
import SQL from "../src/functions/SQL";

(async () => {
  const sql = await SQL();
  const data = await getAdmins(sql);
  console.log(data);
})();
