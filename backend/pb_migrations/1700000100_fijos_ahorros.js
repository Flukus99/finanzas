/// <reference path="../pb_data/types.d.ts" />
// Gastos/ingresos fijos (recurring), metas de ahorro (goals) y los nuevos tipos de movimiento.
migrate((app) => {
  const own = "user = @request.auth.id"
  const rules = {
    listRule: own,
    viewRule: own,
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
    updateRule: own + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
    deleteRule: own,
  }
  const users = app.findCollectionByNameOrId("users")
  const common = [
    { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: true },
    { name: "deleted", type: "bool" },
    { name: "created", type: "autodate", onCreate: true },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]
  const make = (name, fields) => app.save(new Collection({
    type: "base", name, ...rules,
    fields: [...fields, ...common],
    indexes: [`CREATE INDEX idx_${name}_user_updated ON ${name} (user, updated)`],
  }))

  make("recurring", [
    { name: "name", type: "text", required: true, max: 60 },
    { name: "icon", type: "text", max: 16 },
    { name: "kind", type: "select", values: ["gasto", "ingreso"], maxSelect: 1, required: true },
    { name: "freq", type: "select", values: ["mensual", "quincenal", "anual"], maxSelect: 1, required: true },
    { name: "day", type: "number", min: 1, max: 31 },
    { name: "day2", type: "number", min: 0, max: 31 },
    { name: "month", type: "number", min: 0, max: 12 },
    { name: "amount", type: "number", min: 0 },
    { name: "account", type: "text", max: 30 },
    { name: "category", type: "text", max: 30 },
  ])
  make("goals", [
    { name: "name", type: "text", required: true, max: 60 },
    { name: "icon", type: "text", max: 16 },
    { name: "color", type: "text", max: 20 },
    { name: "kind", type: "select", values: ["emergencia", "anual", "meta"], maxSelect: 1, required: true },
    { name: "target", type: "number", min: 0 },
    { name: "deadline", type: "text", max: 7 }, // YYYY-MM
    { name: "recurring", type: "text", max: 30 }, // gasto anual al que está ligado
  ])

  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.getByName("kind").values = ["gasto", "ingreso", "ahorro", "retiro"]
  tx.fields.add(new TextField({ name: "recurring", max: 30 })) // qué gasto/ingreso fijo paga
  tx.fields.add(new TextField({ name: "period", max: 12 })) // qué periodo: 2026-11, 2026-11-2, 2026
  tx.fields.add(new TextField({ name: "goal", max: 30 })) // a qué ahorro va o de cuál sale
  app.save(tx)

  // Categorías nuevas para los usuarios que ya existen.
  const extra = [["Tarjetas", "💳", "#ff9f0a"], ["Suscripciones", "📺", "#bf5af2"], ["Seguros", "🛡️", "#64d2ff"], ["Impuestos", "🏛️", "#8e8e93"]]
  const cats = app.findCollectionByNameOrId("categories")
  for (const u of app.findAllRecords("users")) {
    for (const [name, icon, color] of extra) {
      try { app.findFirstRecordByFilter("categories", "user = {:u} && name = {:n}", { u: u.id, n: name }); continue } catch (_) {}
      const r = new Record(cats)
      r.set("user", u.id); r.set("name", name); r.set("icon", icon); r.set("color", color); r.set("kind", "gasto")
      app.save(r)
    }
  }
}, (app) => {
  for (const n of ["recurring", "goals"]) app.delete(app.findCollectionByNameOrId(n))
  const tx = app.findCollectionByNameOrId("transactions")
  for (const f of ["recurring", "period", "goal"]) tx.fields.removeByName(f)
  tx.fields.getByName("kind").values = ["gasto", "ingreso"]
  app.save(tx)
})
