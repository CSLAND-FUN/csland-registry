console.clear();
import "dotenv/config";

import { AdminInfo, ServerInfo } from "./interfaces";
import { HTMLElement } from "node-html-parser";
import { CronJob } from "cron";
import postWebhook from "./functions/PostWebhook";
import parse from "node-html-parser";
import axios from "axios";
import chunk from "chunk";
import _sql from "./functions/SQL";

import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet"; // prettier-ignore
import { readFileSync } from "node:fs";
import { Sheets } from "google-sheets-api";
import { handleDelete, handlePush } from "./functions/Admins";

var count = 0;

var servers_info: ServerInfo[] = [];
const server_names: Record<string, string> = {
  "CsLand | Public | [!knife !ws !gloves !lvl]": "CSLAND | Public",
  "CsLand | Mirage | [!knife !ws !gloves !lvl]": "CSLAND | Mirage #1",
  "CsLand | AWP | [!knife !ws !gloves !lvl]": "CSLAND | AWP",
  "CsLand | Dust2 | [!knife !ws !gloves !lvl]": "CSLAND | Dust2",
  "CsLand | Mirage #2 | [!knife !ws !gloves !lvl]": "CSLAND | Mirage #2",
};

const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
const key = readFileSync("./keys/sheets.pem").toString();
const API = new Sheets({ email: process.env.SERVICE_EMAIL, key: key });
var sheet: GoogleSpreadsheetWorksheet;

(async () => {
  // #region | Connect to Sheet
  await doc.useServiceAccountAuth({
    client_email: process.env.SERVICE_EMAIL,
    private_key: process.env.SERVICE_KEY,
  });

  const sheets = await API.getSheets(process.env.SHEET_ID);

  await doc.loadInfo();
  sheet = doc.sheetsById[sheets[0].id];
  // #endregion

  // #region | Get & Push Data
  console.log("[#] First time check.");

  const admins = await check();
  if (!admins.length) console.log("– No new admins!");
  else {
    console.log(`# There's ${admins.length} new admin(s)!`);
    await push(admins);
  }
  // #endregion

  console.log("[#] Starting job.");
  new CronJob(
    "0 0 */1 * * *",
    async () => {
      const admins = await check();
      if (!admins.length) console.log("–  No new admins!");
      else {
        console.log(`# There's ${admins.length} new admin(s)!`);
        await push(admins);
      }
    },
    null,
    false,
    "Europe/Moscow"
  ).start();
})();

async function check(): Promise<AdminInfo[]> {
  const url = "https://csland.fun/admins";
  const response = (await axios(url)).data;

  const document = parse(response);
  const col = document.getElementById("admins");

  const server_admins: Record<string, AdminInfo[]> = {};
  const sql = await _sql();

  const servers = col.childNodes.filter((c) => c instanceof HTMLElement);
  for (const server of servers) {
    const server_name_child = server.childNodes.find((b) => {
      return is(b) && b.rawAttrs === 'class="block_head"';
    }) as HTMLElement;

    const server_name = replace(server_name_child.childNodes[0].rawText);
    const name = server_names[server_name];
    server_admins[name] = [];
  }

  for (const server of servers) {
    const server_name_child = server.childNodes.find((b) => {
      return is(b) && b.rawAttrs === 'class="block_head"';
    }) as HTMLElement;

    const server_name = replace(server_name_child.childNodes[0].rawText);

    const admins_table = server.childNodes.find((c) => {
      return is(c) && c.rawAttrs === 'class="table-responsive mb-0"';
    });

    const table = admins_table.childNodes.find((c) => {
      return is(c) && c.rawTagName === "table";
    });

    const tbody = table.childNodes.find((c) => {
      return is(c) && c.rawTagName === "tbody";
    });

    const admins = tbody.childNodes.filter((c) => {
      return is(c) && c.rawAttrs !== 'class="hidden-tr"';
    }) as HTMLElement[];

    for (const admin of admins) {
      const info = admin.childNodes.filter((c) => {
        return is(c) && c.rawTagName === "td";
      });

      // ? Проверка на блок админ-прав
      if (info[2].childNodes.find((c) => is(c) && c.rawTagName === "a")) {
        continue;
      }

      const admin_name = info[1].childNodes[1].childNodes[3].childNodes[0].rawText; // prettier-ignore
      const admin_id_match =
        info[1].childNodes[1].childNodes[3].parentNode.attributes.href.match(
          /[0-9]*/g
        );

      const admin_id = admin_id_match.find((s) => s.length >= 1);
      const steam_id = replace(info[2].childNodes[0].rawText);

      const data = await sql<AdminInfo>("admins").select().where({
        nick: admin_name,
        id: steam_id,
        server: server_names[server_name],
      });

      const toAdd: AdminInfo = {
        server: server_names[server_name],
        nick: admin_name,
        profile: admin_id,
        id: steam_id,

        pushed: undefined,
        alerted_to_delete: undefined,
      };

      if (data.length && data[0].alerted_to_delete) {
        await sql<AdminInfo>("admins")
          .delete()
          .where({ id: data[0].id, server: data[0].server });

        continue;
      } else if (data.length) {
        toAdd["pushed"] = data[0].pushed;
        toAdd["alerted_to_delete"] = data[0].alerted_to_delete;
      } else if (!data.length) {
        toAdd["pushed"] = false;
        toAdd["alerted_to_delete"] = false;
      }

      server_admins[server_names[server_name]].push(toAdd);
    }

    servers_info.push({
      name: server_names[server_name],
      admins: server_admins[server_names[server_name]],
    });
  }

  const to_delete: AdminInfo[] = [];
  for (const server of servers_info) {
    to_delete.push(...(await handleDelete(sql, server)));
  }

  if (to_delete.length) {
    const admins = to_delete
      .map((adm) => `› [${adm.server}] ${adm.nick} - ${adm.id}`)
      .join("\n");

    await postWebhook("Необходимо удаление из таблицы!", admins);
  }

  const to_push: AdminInfo[] = [];
  for (const { admins } of servers_info) {
    to_push.push(...(await handlePush(sql, admins)));
  }

  if (to_push.length) {
    const admins = to_push
      .map((adm) => `› [${adm.server}] ${adm.nick} - ${adm.id}`)
      .join("\n");

    await postWebhook("В таблицу добавлены новые админы!", admins, false);
  }

  return to_push;
}

async function push(admins: AdminInfo[]) {
  const out = [];
  const sql = await _sql();

  for (const admin of admins) {
    if (admin.pushed) continue;

    out.push({
      Никнейм: admin.nick,
      SteamID: admin.id,
      Сервер: admin.server,
      "Ссылка на профиль": `https://csland.fun/profile?id=${admin.profile}`,
      "Кол-во Варнов": 0,
    });
  }

  const chunks = chunk(out, 60);
  var sleeps_count = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    for (const data of c) {
      if (count === 60) {
        count = 0;
        sleeps_count += 1;

        console.log(`—› #${sleeps_count} Interval Activated - 61 seconds`);
        await sleep(61000);
      }

      try {
        await sheet.addRow(data);
      } catch (error) {
        await sleep(61000);
        await sheet.addRow(data);
      }

      await sql<AdminInfo>("admins")
        .update({ pushed: true })
        .where({ id: data["SteamID"], server: data["Сервер"] });

      count += 1;
    }
  }

  return true;
}

function sleep(ms: number) {
  return new Promise((res, rej) => setTimeout(res, ms));
}

function is(arg: unknown): arg is HTMLElement {
  return arg instanceof HTMLElement;
}

function replace(str: string) {
  return str.replaceAll("\n", "").replaceAll("\t", "");
}
