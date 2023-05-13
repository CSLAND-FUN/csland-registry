import "dotenv/config";
import knex from "knex";

const sql = knex({
  client: "pg",
  connection: process.env.PQ_STRING,
});

const hasTable = async (name: string) => await sql.schema.hasTable(name);

export default async function () {
  const admins = await hasTable("admins");
  if (!admins) {
    await sql.schema.createTable("admins", (table) => {
      table.string("server", 255).notNullable();
      table.string("nick", 255).notNullable();
      table.string("id", 255).notNullable();
      table.string("profile", 255).notNullable();
      table.boolean("pushed").notNullable().defaultTo(false);
      table.boolean("alerted_to_delete").notNullable().defaultTo(false);

      return table;
    });
  }

  return sql;
}
