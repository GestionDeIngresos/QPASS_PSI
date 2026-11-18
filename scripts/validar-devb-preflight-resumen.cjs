/* eslint-disable @typescript-eslint/no-require-imports -- Diagnóstico SQL con fixtures en memoria, sin red ni migraciones. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(
  path.resolve(".next/devb-tools/node_modules/@electric-sql/pglite"),
);
const {
  recrearCatalogo,
  sembrar,
  usuario,
} = require("./devd-catalogo-fixture.cjs");
const resumen = fs.readFileSync(
  "supabase/preflight_devb_resumen_solo_lectura.sql",
  "utf8",
);

// Solo fixtures: lee firmas de los archivos, crea stubs que jamás se invocan.
// NO ejecuta el contenido de las migraciones ni sus cuerpos transaccionales.
async function firmasFixture(db) {
  const nombres = new Set([
    "comprar_entradas_terceros_prueba",
    "reportar_entrada_propia",
    "cobrar_venta",
    "devc_dueno_activo",
    "devc_es_dueno",
    "crear_negocio",
    "vincular_ayudante",
    "crear_solicitud_devolucion",
    "devc_mis_solicitudes_devolucion",
    "devc_eventos_devolucion_cliente",
    "devc_eventos_encargado",
    "listar_solicitudes_devolucion",
    "rechazar_solicitud_devolucion",
  ]);
  for (const f of [
    "migrations/202611160001_devd_hu9.sql",
    "migrations/202611160002_devd_hu14.sql",
    "migrations/202611160004_devd_comercio_rpc.sql",
    "sprint3_devC_negocios.sql",
    "sprint3_devC_ayudantes.sql",
    "sprint3_devC_devoluciones.sql",
  ]) {
    const fuente = fs.readFileSync("supabase/" + f, "utf8");
    const patron =
      /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\blanguage\s+\w+[\s\S]*?\bas\s+\$\$/gi;
    for (const m of fuente.matchAll(patron))
      if (nombres.delete(m[1])) {
        await db.exec(`create or replace function public.${m[1]}(${m[2]}) returns ${m[3]}
        language plpgsql security definer set search_path='' as $fixture$
        begin raise exception 'FIXTURE_METADATA_ONLY'; end $fixture$;
        revoke all on function public.${m[1]}(${m[2]
          .split(",")
          .map((x) => x.trim().split(/\s+/).slice(1).join(" "))
          .join(",")}) from public,anon;
      `);
        // Para las firmas verificadas aquí no hay DEFAULT ni tipos compuestos con comas.
        const firma = `${m[1]}(${m[2]
          .split(",")
          .map((x) => x.trim().split(/\s+/).slice(1).join(" "))
          .join(",")})`;
        await db.exec(
          `grant execute on function public.${firma} to authenticated`,
        );
      }
  }
  assert.equal(
    nombres.size,
    0,
    "Faltan firmas reales para los stubs de metadata",
  );
}

async function main() {
  const db = new PGlite();
  let total = 0;
  const leer = async () => {
    const r = await db.exec(resumen);
    assert.equal(r.length, 1, "Debe producir exactamente una tabla");
    assert.ok(r[0].rows.length > 170);
    assert.ok(
      r[0].rows.every((x) =>
        ["OK", "ADVERTENCIA", "BLOQUEO"].includes(x.estado),
      ),
    );
    return r[0].rows;
  };
  const fila = (r, id) => {
    const x = r.find((x) => x.comprobacion === id);
    assert.ok(x, id);
    return x;
  };
  const test = async (n, f) => {
    await f();
    total++;
    console.log("PASS " + n);
  };
  const variante = async (f) => {
    await db.exec("begin");
    try {
      await f();
    } finally {
      await db.exec("rollback");
    }
  };
  try {
    await test("esquema vacío devuelve bloqueos explícitos sin fallar por tablas/roles ausentes", async () => {
      const r = await leer();
      assert.equal(fila(r, "RESUMEN_GENERAL").estado, "BLOQUEO");
      assert.equal(fila(r, "DATOS_SALDOS_DUPLICADOS").cantidad, null);
      assert.equal(fila(r, "DATOS_SALDOS_DUPLICADOS").estado, "BLOQUEO");
    });
    await recrearCatalogo(db);
    await sembrar(db);
    await firmasFixture(db);
    await db.exec(`alter table saldos_puntos add column reservado numeric(10,2) not null default 0;
      alter table saldos_puntos add constraint devd_saldo_cubre_reserva
        check(reservado>=0 and saldo>=reservado and saldo<>'NaN'::numeric and reservado<>'NaN'::numeric);
      create function devd_mantener_reserva() returns trigger language plpgsql security definer set search_path=''
        as $$begin return new; end$$;
      create function devd_proteger_saldo() returns trigger language plpgsql set search_path=''
        as $$begin return new; end$$;
      create function devd_impedir_borrado_financiero() returns trigger language plpgsql set search_path=''
        as $$begin return old; end$$;
      create trigger devd_reserva before insert or update on solicitudes_devolucion for each row execute function devd_mantener_reserva();
      create trigger devd_saldo_claves before update on saldos_puntos for each row execute function devd_proteger_saldo();
      create trigger devd_no_borrar_reservas before delete on solicitudes_devolucion for each row execute function devd_impedir_borrado_financiero();
      create table devc_parametros(clave text primary key,valor integer);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      alter table storage.objects enable row level security;
      insert into storage.buckets values('devoluciones','devoluciones',false,5242880,array['image/png','image/jpeg','image/webp']);`);
    await test("catálogo compatible: una tabla, cero bloqueos y advertencias operativas visibles", async () => {
      const r = await leer();
      assert.deepEqual(
        r.filter((x) => x.estado === "BLOQUEO"),
        [],
      );
      assert.equal(fila(r, "RESUMEN_GENERAL").estado, "ADVERTENCIA");
      assert.equal(Number(fila(r, "RESUMEN_GENERAL").cantidad), 0);
      assert.equal(fila(r, "HISTORIAL_CLI").estado, "ADVERTENCIA");
      assert.equal(fila(r, "COLISION_FUNCIONES_B").estado, "OK");
      assert.equal(
        fila(r, "OPERACION_RECARGADORES_ASIGNADOS").estado,
        "ADVERTENCIA",
      );
    });
    await test("SELECT completo funciona en transacción READ ONLY y no expone datos personales", async () => {
      const antes = (
        await db.query("select saldo,reservado from saldos_puntos")
      ).rows;
      await db.exec("begin transaction read only");
      let r;
      try {
        r = await leer();
      } finally {
        await db.exec("rollback");
      }
      assert.deepEqual(
        (await db.query("select saldo,reservado from saldos_puntos")).rows,
        antes,
      );
      assert.doesNotMatch(
        JSON.stringify(r),
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@test\.local|QR-REGALO/i,
      );
    });
    await test("columna faltante omite conteos y no dispara error de compilación", async () =>
      variante(async () => {
        await db.exec(
          "alter table saldos_puntos drop column reservado cascade",
        );
        const r = await leer();
        assert.equal(
          fila(r, "COLUMNA_public.saldos_puntos.reservado").estado,
          "BLOQUEO",
        );
        assert.equal(fila(r, "DATOS_RESERVAS_ACUMULADAS").cantidad, null);
      }));
    await test("tabla ausente conserva el resto de resultados", async () =>
      variante(async () => {
        await db.exec("drop table recargas cascade");
        const r = await leer();
        assert.equal(fila(r, "TABLA_public.recargas").estado, "BLOQUEO");
        assert.equal(fila(r, "DATOS_RECARGAS_HISTORICAS").cantidad, null);
        assert.equal(fila(r, "DATOS_SALDOS_DUPLICADOS").estado, "OK");
      }));
    await test("tipo incompatible bloquea y omite el cálculo que no sería válido", async () =>
      variante(async () => {
        await db.exec(
          "alter table saldos_puntos drop column reservado cascade;alter table saldos_puntos add column reservado text",
        );
        const r = await leer();
        assert.equal(
          fila(r, "COLUMNA_public.saldos_puntos.reservado").estado,
          "BLOQUEO",
        );
        assert.equal(fila(r, "DATOS_SALDOS_INVALIDOS").cantidad, null);
      }));
    await test("duplicado usuario/evento se cuenta y bloquea", async () =>
      variante(async () => {
        await db.exec(
          "alter table saldos_puntos drop constraint saldos_puntos_usuario_id_evento_id_key",
        );
        await db.query(
          "insert into saldos_puntos(usuario_id,evento_id,saldo) values($1,1,25)",
          [usuario(5)],
        );
        const x = fila(await leer(), "DATOS_SALDOS_DUPLICADOS");
        assert.equal(x.estado, "BLOQUEO");
        assert.equal(Number(x.cantidad), 1);
      }));
    await test("clave única faltante impide las FK nuevas de B", async () =>
      variante(async () => {
        await db.exec(
          "alter table recargas drop constraint recargas_pkey cascade",
        );
        assert.equal(
          fila(await leer(), "CLAVE_REFERENCIADA_B_public.recargas").estado,
          "BLOQUEO",
        );
      }));
    await test("reserva distinta de solicitudes se detecta", async () =>
      variante(async () => {
        await db.exec("update saldos_puntos set reservado=10");
        assert.equal(
          fila(await leer(), "DATOS_RESERVAS_ACUMULADAS").estado,
          "BLOQUEO",
        );
      }));
    await test("saldo negativo y barrera de D alterada se detectan", async () =>
      variante(async () => {
        const checks = (
          await db.query(
            "select conname from pg_constraint where conrelid='saldos_puntos'::regclass and contype='c'",
          )
        ).rows;
        for (const { conname } of checks)
          await db.exec(
            'alter table saldos_puntos drop constraint "' +
              conname.replaceAll('"', '""') +
              '"',
          );
        await db.exec(
          "alter table saldos_puntos add constraint devd_saldo_cubre_reserva check(true);update saldos_puntos set saldo=-1",
        );
        const r = await leer();
        assert.equal(fila(r, "DATOS_SALDOS_INVALIDOS").estado, "BLOQUEO");
        assert.equal(
          fila(r, "CONSTRAINT_DEVD_SALDO_CUBRE_RESERVA").estado,
          "BLOQUEO",
        );
      }));
    const solicitud = async () =>
      Number(
        (
          await db.query(
            "insert into solicitudes_devolucion(usuario_id,evento_id,monto_solicitado,qr_bancario_url,estado) values($1,1,10,'fixture/privado','aprobada') returning id",
            [usuario(5)],
          )
        ).rows[0].id,
      );
    const devolver = async (id) =>
      db.query(
        "insert into devoluciones(usuario_id,encargado_id,solicitud_id,monto,comprobante_url) values($1,$2,$3,10,'fixture/privado')",
        [usuario(5), usuario(6), id],
      );
    await test("aprobada legítima sin liquidar es advertencia, no pago inferido", async () =>
      variante(async () => {
        await solicitud();
        await db.exec("update saldos_puntos set reservado=10");
        const r = await leer();
        assert.equal(
          fila(r, "DATOS_APROBADAS_POR_REVISAR").estado,
          "ADVERTENCIA",
        );
        assert.equal(fila(r, "DATOS_LIQUIDACION_INCOHERENTE").estado, "OK");
        assert.equal(fila(r, "DATOS_RESERVAS_ACUMULADAS").estado, "OK");
      }));
    await test("devolución histórica enlazada sin marca bloquea y duplicados también", async () =>
      variante(async () => {
        const id = await solicitud();
        await devolver(id);
        assert.equal(
          fila(await leer(), "DATOS_DEVOLUCIONES_SIN_MARCA").estado,
          "BLOQUEO",
        );
        await devolver(id);
        assert.equal(
          fila(await leer(), "DATOS_DEVOLUCIONES_DUPLICADAS").estado,
          "BLOQUEO",
        );
      }));
    await test("marca liquidada sin histórico coherente y columna B parcial bloquean", async () =>
      variante(async () => {
        await solicitud();
        await db.exec(
          "alter table solicitudes_devolucion add column liquidada_en timestamptz; update solicitudes_devolucion set liquidada_en=now()",
        );
        const r = await leer();
        assert.equal(
          fila(r, "DATOS_LIQUIDACION_INCOHERENTE").estado,
          "BLOQUEO",
        );
        assert.equal(
          fila(r, "COLISION_COLUMNA_B_solicitudes_devolucion.liquidada_en")
            .estado,
          "BLOQUEO",
        );
      }));
    await test("solicitud activa sin saldo se detecta sin crear puntos", async () =>
      variante(async () => {
        await solicitud();
        await db.exec("delete from saldos_puntos");
        assert.equal(
          fila(await leer(), "DATOS_SOLICITUDES_SIN_SALDO").estado,
          "BLOQUEO",
        );
      }));
    await test("operador con Auth/asignación válida se cuenta; rol incoherente se advierte", async () =>
      variante(async () => {
        await db.query("update usuarios set rol='recargador' where id=$1", [
          usuario(2),
        ]);
        await db.query(
          "insert into asignaciones_staff(usuario_id,evento_id,rol_staff) values($1,1,'recargador')",
          [usuario(2)],
        );
        const r = await leer();
        assert.equal(fila(r, "OPERACION_RECARGADORES_ASIGNADOS").estado, "OK");
        assert.equal(
          Number(fila(r, "OPERACION_RECARGADORES_ASIGNADOS").cantidad),
          1,
        );
        await db.query("update usuarios set rol='cliente' where id=$1", [
          usuario(2),
        ]);
        assert.equal(
          fila(await leer(), "OPERACION_ASIGNACIONES_INCOMPATIBLES").estado,
          "ADVERTENCIA",
        );
      }));
    await test("RPC ausente y ACL anónima heredada se señalan sin invocar funciones", async () =>
      variante(async () => {
        await db.exec(
          "drop function crear_solicitud_devolucion(integer,numeric,text);grant execute on function identificar_qr(text,integer) to anon",
        );
        const r = await leer();
        assert.equal(
          fila(r, "RPC_public.crear_solicitud_devolucion(integer,numeric,text)")
            .estado,
          "BLOQUEO",
        );
        assert.equal(
          fila(r, "ACL_HEREDADA_public.identificar_qr(text,integer)").estado,
          "BLOQUEO",
        );
      }));
    await test("política Storage amplia queda visible como advertencia sin exponer su expresión", async () =>
      variante(async () => {
        await db.exec(
          "create policy fixture_amplia on storage.objects for all to authenticated using(true) with check(true)",
        );
        const x = fila(await leer(), "STORAGE_POLITICA_fixture_amplia");
        assert.equal(x.estado, "ADVERTENCIA");
      }));
    await test("RPC de B existente bloquea reaplicar sin ejecutarla", async () =>
      variante(async () => {
        await db.exec(
          "create function consultar_mis_saldos() returns jsonb language plpgsql as $$begin raise exception 'NO_INVOCAR';end$$",
        );
        assert.equal(
          fila(await leer(), "COLISION_FUNCIONES_B").estado,
          "BLOQUEO",
        );
      }));
    await test("rol cliente bajo RLS no puede certificar conteos como cero incidencias", async () => {
      await db.exec("set role authenticated");
      try {
        const r = await leer();
        assert.equal(fila(r, "SESION_SQL_EDITOR").estado, "BLOQUEO");
        assert.equal(fila(r, "DATOS_SALDOS_DUPLICADOS").estado, "BLOQUEO");
        assert.equal(fila(r, "DATOS_SALDOS_DUPLICADOS").cantidad, null);
      } finally {
        await db.exec("reset role");
      }
    });
    console.log(
      `${total} pruebas del resumen aprobadas. Solo fixtures en memoria; sin ejecutar migraciones ni conectar a Supabase.`,
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
