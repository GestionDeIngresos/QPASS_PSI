/* eslint-disable @typescript-eslint/no-require-imports -- Despliegue SQL exclusivamente en memoria, sin credenciales ni red. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(
  path.resolve(".next/devb-tools/node_modules/@electric-sql/pglite"),
);
const {
  recrearCatalogo,
  sembrar,
  migraciones,
  usuario,
} = require("./devd-catalogo-fixture.cjs");
const sql = (f) => fs.readFileSync("supabase/" + f, "utf8");
const pre = sql("preflight_devb_despliegue_solo_lectura.sql");
const post = sql("postflight_devb_despliegue_solo_lectura.sql");
const b = sql("migrations/202611170001_devb_saldos.sql");
async function main() {
  const db = new PGlite();
  let total = 0;
  const test = async (nombre, f) => {
    await f();
    console.log("PASS " + nombre);
    total++;
  };
  const rechazo = async (codigo) => {
    await assert.rejects(
      () => db.exec(pre),
      (e) => e.message.includes(codigo),
    );
    await db.exec("rollback");
  };
  const sinCambios = async (f) => {
    await db.exec("begin");
    try {
      await f();
    } finally {
      await db.exec("rollback");
    }
  };
  try {
    await recrearCatalogo(db);
    await sembrar(db);
    // Catálogo histórico Sprint 2/A instalado; volver a contrastar los scripts A revisados.
    for (const f of [
      "sprint3_devA_qr.sql",
      "sprint3_devA_reportes.sql",
      "sprint3_devA_pagos_prueba.sql",
    ])
      await db.exec(sql(f));
    for (const f of migraciones) await db.exec(sql("migrations/" + f));
    await db.exec(`create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;`);
    for (const f of [
      "sprint3_devC_negocios.sql",
      "sprint3_devC_ayudantes.sql",
      "sprint3_devC_devoluciones.sql",
    ])
      await db.exec(sql(f));
    await test("orden A -> D000..004 -> C negocios/ayudantes/devoluciones admite preflight sin B", async () => {
      const resultados = await db.exec(pre);
      const columnas = resultados.find((r) =>
        r.rows.some((x) => x.tabla === "usuarios" && x.columna === "activo"),
      );
      assert.ok(columnas.rows.length > 60);
      assert.ok(columnas.rows.every((r) => r.presente));
    });
    await test("preflight no cambia saldo, reservas ni históricos", async () => {
      const leer = () =>
        db.query(
          "select saldo,reservado,(select count(*) from recargas) recargas,(select count(*) from devoluciones) devoluciones from saldos_puntos",
        );
      const antes = await leer();
      await db.exec(pre);
      assert.deepEqual((await leer()).rows, antes.rows);
    });
    await test("trigger de reserva deshabilitado bloquea despliegue", async () => {
      await db.exec(
        "alter table solicitudes_devolucion disable trigger devd_reserva",
      );
      try {
        await rechazo("DEVB_PRERREQUISITO_TRIGGERS_D");
      } finally {
        await db.exec(
          "alter table solicitudes_devolucion enable trigger devd_reserva",
        );
      }
    });
    await test("Storage sin RLS bloquea despliegue", async () => {
      await db.exec("alter table storage.objects disable row level security");
      try {
        await rechazo("DEVB_STORAGE_SIN_RLS");
      } finally {
        await db.exec("alter table storage.objects enable row level security");
      }
    });
    await test("ACL heredada pública de C bloquea despliegue antes de conservarla", async () => {
      await db.exec(
        "grant execute on function crear_solicitud_devolucion(integer,numeric,text) to public",
      );
      try {
        await rechazo("DEVB_ACL_HEREDADA_INCOMPATIBLE");
      } finally {
        await db.exec(
          "revoke execute on function crear_solicitud_devolucion(integer,numeric,text) from public",
        );
      }
    });
    await test("columna B parcial bloquea reaplicación", async () => {
      await db.exec("alter table recargas add column puntos numeric(10,2)");
      try {
        await rechazo("DEVB_INSTALACION_PREVIA_O_COLISION");
      } finally {
        await db.exec("alter table recargas drop column puntos");
      }
    });
    await db.query(
      `insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url,estado)
      values($1,1,10,'fixture/qr.jpg','aprobada')`,
      [usuario(5)],
    );
    await test("aprobada sin liquidar reserva 10 y permite instalar B", async () => {
      await db.exec(pre);
    });
    await db.query(
      `insert into devoluciones(usuario_id,encargado_id,solicitud_id,monto,comprobante_url,foto_usuario_url)
      values($1,$2,1,10,'fixture/comprobante.jpg','fixture/foto.jpg')`,
      [usuario(5), usuario(6)],
    );
    await test("una devolución histórica enlazada exige conciliación antes de habilitar B", async () => {
      await rechazo("DEVB_LIQUIDACIONES_HEREDADAS");
    });
    await db.query(
      `insert into devoluciones(usuario_id,encargado_id,solicitud_id,monto,comprobante_url,foto_usuario_url)
      values($1,$2,1,10,'fixture/comprobante-2.jpg','fixture/foto-2.jpg')`,
      [usuario(5), usuario(6)],
    );
    await test("duplicados históricos se detectan antes del índice único", async () => {
      await rechazo("DEVB_LIQUIDACIONES_DUPLICADAS");
    });
    // Solo fixtures de esta memoria; todavía no se han instalado triggers B.
    await db.exec("delete from devoluciones");
    await test("instalar B conserva saldo 100 y reserva heredada 10; no inventa tasa", async () => {
      await db.exec(b);
      const { rows } =
        await db.query(`select saldo::text saldo,reservado::text reservado,
        (select count(*)::int from devb_conversion) tasas from saldos_puntos`);
      assert.deepEqual(rows, [
        { saldo: "100.00", reservado: "10.00", tasas: 0 },
      ]);
    });
    await test("postflight completo verifica todas las RPC/ACL, triggers, índices y RLS", async () => {
      const resultados = await db.exec(post);
      let booleanos = 0;
      for (const resultado of resultados)
        for (const fila of resultado.rows)
          for (const [k, v] of Object.entries(fila)) {
            if (typeof v === "boolean" && k !== "configurado") {
              assert.equal(v, true, JSON.stringify(fila));
              booleanos++;
            }
          }
      assert.ok(booleanos >= 180);
    });
    await test("verificación financiera existente acepta aprobada sin liquidar", async () => {
      for (const r of await db.exec(sql("verificacion_devb_saldos.sql")))
        for (const fila of r.rows)
          if ("correcto" in fila)
            assert.equal(fila.correcto, true, fila.prueba);
    });
    await test("postflight detecta concesión indebida de RPC a anon", async () => {
      await sinCambios(async () => {
        await db.exec(
          "grant execute on function consultar_mis_saldos() to anon",
        );
        const resultados = await db.exec(
          post
            .replace("begin transaction read only;", "")
            .replace(/rollback;\s*$/, ""),
        );
        assert.equal(
          resultados
            .flatMap((r) => r.rows)
            .find((r) => r.firma === "consultar_mis_saldos()").anon_denegado,
          false,
        );
      });
    });
    await test("postflight detecta pérdida de inmutabilidad", async () => {
      await sinCambios(async () => {
        await db.exec(
          "alter table recargas disable trigger devb_recarga_inmutable",
        );
        const resultados = await db.exec(
          post
            .replace("begin transaction read only;", "")
            .replace(/rollback;\s*$/, ""),
        );
        assert.equal(
          resultados
            .flatMap((r) => r.rows)
            .find((r) => r.nombre === "devb_recarga_inmutable").correcto,
          false,
        );
      });
    });
    await test("HU16 consulta solo cliente activo; no necesita tasa de conversión", async () => {
      await db.exec(`set test.uid='${usuario(5)}';set role authenticated`);
      try {
        const r = (await db.query("select consultar_mis_saldos() r")).rows[0].r;
        assert.equal(r.length, 1);
        assert.equal(r[0].saldo, "100.00");
        assert.equal(r[0].reservado, "10.00");
        assert.equal(r[0].disponible, "90.00");
      } finally {
        await db.exec("reset role");
      }
    });
    await test("B ya instalada se rechaza como candidata a reaplicación", async () => {
      await rechazo("DEVB_INSTALACION_PREVIA_O_COLISION");
    });
    console.log(
      `${total} pruebas de preparación de despliegue aprobadas en PGlite. Sin Supabase ni datos reales.`,
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
