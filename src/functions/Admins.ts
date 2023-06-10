import { AdminInfo, ServerInfo } from "../interfaces";
import { Knex } from "knex";

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
