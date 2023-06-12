import { AdminInfo, ServerInfo } from "../interfaces";
import { Knex } from "knex";

import parse, { HTMLElement } from "node-html-parser";
import axios from "axios";

const Names: Record<string, string> = {
  "CsLand | Public | [!knife !ws !gloves !lvl]": "CSLAND | Public",
  "CsLand | Mirage | [!knife !ws !gloves !lvl]": "CSLAND | Mirage #1",
  "CsLand | AWP | [!knife !ws !gloves !lvl]": "CSLAND | AWP",
  "CsLand | Dust2 | [!knife !ws !gloves !lvl]": "CSLAND | Dust2",
  "CsLand | Mirage #2 | [!knife !ws !gloves !lvl]": "CSLAND | Mirage #2",
};

const Servers = [
  "CSLAND | Public",
  "CSLAND | Mirage #1",
  "CSLAND | AWP",
  "CSLAND | Dust2",
  "CSLAND | Mirage #2",
];

export async function getAdmins(
  sql: Knex,
  ignore = false
): Promise<Map<string, AdminInfo[]>> {
  const out: Map<string, AdminInfo[]> = new Map();
  for (const server of Servers) out.set(server, []);

  const url = "https://csland.fun/admins";
  const response = (await axios(url)).data;

  const document = parse(response);
  const col = document.getElementById("admins");

  const servers = col.childNodes.filter((c) => c instanceof HTMLElement);
  for (const server of servers) {
    const child = server.childNodes.find((b) => {
      return is(b) && b.rawAttrs === 'class="block_head"';
    }) as HTMLElement;

    // ? Server Name
    const name = Names[parseString(child.childNodes[0].rawText)];
    const server_admins = out.get(name);

    // #region | Getting Admins Table
    const _table = server.childNodes.find((c) => {
      return is(c) && c.rawAttrs === 'class="table-responsive mb-0"';
    });

    const table = _table.childNodes.find((c) => {
      return is(c) && c.rawTagName === "table";
    });

    const body = table.childNodes.find((c) => {
      return is(c) && c.rawTagName === "tbody";
    });

    const admins = body.childNodes.filter((c) => {
      return is(c) && c.rawAttrs !== 'class="hidden-tr"';
    }) as HTMLElement[];
    // #endregion

    for (const admin of admins) {
      const info = admin.childNodes.filter((c) => {
        return is(c) && c.rawTagName === "td";
      });

      // #region | Проверка на наличие блокировки Админ-Прав
      if (info[2].childNodes.find((c) => is(c) && c.rawTagName === "a")) {
        continue;
      }
      // #endregion

      const steam_id = parseString(info[2].childNodes[0].rawText);
      const profile_name = info[1].childNodes[1].childNodes[3].childNodes[0].rawText; // prettier-ignore
      const profile_id =
        info[1].childNodes[1].childNodes[3].parentNode.attributes.href
          .match(/[0-9]*/g)
          .find((s) => s.length >= 1);

      const rows = await sql<AdminInfo>("admins").select().where({
        nick: profile_name,
        id: steam_id,
        server: name,
      });

      if (typeof process.env.FIRST_RUN !== "string" && !ignore && rows.length) {
        continue;
      } else {
        const data: AdminInfo = {
          server: name,
          nick: profile_name,
          profile: profile_id,
          id: steam_id,

          pushed: false,
          alerted_to_delete: false,
        };

        if (rows.length) {
          const row = rows[0];

          data.pushed = row.pushed;
          data.alerted_to_delete = row.alerted_to_delete;
        }

        server_admins.push(data);
      }
    }

    out.set(name, server_admins);
  }

  return out;
}

export async function handleDelete(sql: Knex, server: ServerInfo) {
  const out: AdminInfo[] = [];

  const _ = await sql<AdminInfo>("admins").select();
  const admins = _.filter((adm) => adm.server === server.name);

  for (const db_admin of admins) {
    const admin = server.admins.find((adm) => {
      return adm.id === db_admin.id && adm.server === db_admin.server;
    });

    if (!admin && !db_admin.alerted_to_delete) {
      await sql<AdminInfo>("admins")
        .update({ alerted_to_delete: true })
        .where({ id: db_admin.id, server: db_admin.server });

      out.push(db_admin);
      continue;
    }
  }

  return out;
}

export async function handlePush(sql: Knex, admins: AdminInfo[]) {
  const out: AdminInfo[] = [];

  for (const admin of admins) {
    const data = await sql<AdminInfo>("admins")
      .select()
      .where({ id: admin.id, server: admin.server });

    if (!data.length) {
      await sql<AdminInfo>("admins").insert(admin);
      out.push(admin);

      continue;
    } else if (data.length && !data[0].pushed) {
      out.push(admin);
      continue;
    }
  }

  return out;
}

function is(arg: unknown): arg is HTMLElement {
  return arg instanceof HTMLElement;
}

function parseString(str: string) {
  return str.replaceAll("\n", "").replaceAll("\t", "");
}
