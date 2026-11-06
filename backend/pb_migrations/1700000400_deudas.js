/// <reference path="../pb_data/types.d.ts" />
// Deudas: créditos, tarjetas, préstamos personales… La cuota la escribe el usuario
// (depende de los intereses de cada entidad) y se paga como un gasto fijo mensual.
migrate((app) => {
  const own = "user = @request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base", name: "debts",
    listRule: own, viewRule: own, deleteRule: own,
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
    updateRule: own + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
    fields: [
      { name: "name", type: "text", required: true, max: 60 },
      { name: "icon", type: "text", max: 16 },
      { name: "kind", type: "select", values: ["tarjeta", "credito", "prestamo", "otro"], maxSelect: 1, required: true },
      { name: "lender", type: "text", max: 60 },          // banco, entidad o persona
      { name: "amount", type: "number", min: 0 },          // monto de la deuda al asumirla
      { name: "cuota", type: "number", min: 0 },           // cuota mensual (manual)
      { name: "installments", type: "number", min: 0 },    // total de cuotas (0 = sin plazo fijo)
      { name: "paid_before", type: "number", min: 0 },     // cuotas pagadas antes de usar la app
      { name: "next_date", type: "text", max: 10 },        // fecha de la próxima cuota (YYYY-MM-DD)
      { name: "day", type: "number", min: 1, max: 31 },    // día de pago
      { name: "rate", type: "number", min: 0 },            // tasa de interés (solo informativa)
      { name: "balance", type: "number", min: 0 },         // saldo según la entidad (manual)
      { name: "balance_date", type: "text", max: 10 },
      { name: "account", type: "text", max: 30 },          // de dónde se paga
      { name: "closed", type: "bool" },                    // marcada como pagada
      { name: "note", type: "text", max: 300 },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "deleted", type: "bool" },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_debts_user_updated ON debts (user, updated)"],
  }))

  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.add(new TextField({ name: "debt", max: 30 })) // pago (cuota o abono) de una deuda
  app.save(tx)

  const cats = app.findCollectionByNameOrId("categories")
  for (const u of app.findAllRecords("users")) {
    try { app.findFirstRecordByFilter("categories", "user = {:u} && name = 'Deudas'", { u: u.id }); continue } catch (_) {}
    const r = new Record(cats)
    r.set("user", u.id); r.set("name", "Deudas"); r.set("icon", "🧾"); r.set("color", "#ff453a"); r.set("kind", "gasto")
    app.save(r)
  }
}, (app) => {
  app.delete(app.findCollectionByNameOrId("debts"))
  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.removeByName("debt")
  app.save(tx)
})
