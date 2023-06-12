console.clear();
import "dotenv/config";

import { getAdmins, handleDelete, handlePush } from "./functions/Admins";
import { AdminInfo, ServerInfo } from "./interfaces";
import { HTMLElement } from "node-html-parser";
import { CronJob } from "cron";
import postWebhook from "./functions/PostWebhook";
import chunk from "chunk";
import SQL from "./functions/SQL";

import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet"; // prettier-ignore
import { readFileSync } from "node:fs";
import { Sheets } from "google-sheets-api";

const servers_info: ServerInfo[] = [];
var count = 0;

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
  const sql = await SQL();
  const data = await getAdmins(sql);
  for (const [server, admins] of data) {
    if (typeof process.env.FIRST_RUN === "string") {
      for (const admin of admins) {
        await sql<AdminInfo>("admins").insert(admin);
      }

      process.exit(0);
    }

    servers_info.push({
      name: server,
      admins: admins,
    });
  }

  const temp_admins = await getAdmins(sql, true);
  const temp_data: ServerInfo[] = [];
  for (const [server, admins] of temp_admins) {
    temp_data.push({
      name: server,
      admins: admins,
    });
  }

  const to_delete: AdminInfo[] = [];
  for (const server of temp_data) {
    const data = await handleDelete(sql, server);
    to_delete.push(...data);
  }

  if (to_delete.length) {
    const admins = to_delete
      .map((adm) => `› [${adm.server}] ${adm.nick} - ${adm.id}`)
      .join("\n");

    await postWebhook("Необходимо удаление из таблицы!", admins);

    for (const admin of to_delete) {
      await sql<AdminInfo>("admins")
        .delete()
        .where({ id: admin.id, server: admin.server });
    }
  }

  const to_push: AdminInfo[] = [];
  for (const { admins } of temp_data) {
    const data = await handlePush(sql, admins);
    to_push.push(...data);
  }

  if (to_push.length) {
    const admins = to_push.map((adm) => {
      return `› [${adm.server}] ${adm.nick} - ${adm.id}`;
    });

    if (admins.join("\n").length >= 4096) {
      await postWebhook(
        "В таблицу добавляются новые админы!",
        "Содержимое слишком большое, поскольку было добавлено большое количество администраторов!",
        false
      );
    } else {
      await postWebhook(
        "В таблицу добавлены новые админы!",
        admins.join("\n"),
        false
      );
    }
  }

  return to_push;
}

async function push(admins: AdminInfo[]) {
  const out = [];
  const sql = await SQL();

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
        await sql<AdminInfo>("admins")
          .update({ pushed: true })
          .where({ id: data["SteamID"], server: data["Сервер"] });
      } catch (error) {
        await sleep(61000);
        await sheet.addRow(data);
      }

      count += 1;
    }
  }

  return true;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
