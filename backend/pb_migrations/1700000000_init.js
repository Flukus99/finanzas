/// <reference path="../pb_data/types.d.ts" />
// Crea las colecciones de la app. Cada registro pertenece a un usuario y solo él lo ve.
// "deleted" es un borrado suave: así el borrado también se sincroniza a los otros dispositivos.
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
  const make = (name, fields) => {
    const c = new Collection({
      type: "base", name, ...rules,
      fields: [...fields, ...common],
      indexes: [`CREATE INDEX idx_${name}_user_updated ON ${name} (user, updated)`],
    })
    app.save(c)
  }
  make("accounts", [
    { name: "name", type: "text", required: true, max: 60 },
    { name: "kind", type: "select", values: ["efectivo", "banco", "tarjeta", "ahorro"], maxSelect: 1 },
    { name: "initial", type: "number" },
    { name: "color", type: "text", max: 20 },
  ])
  make("categories", [
    { name: "name", type: "text", required: true, max: 60 },
    { name: "kind", type: "select", values: ["gasto", "ingreso"], maxSelect: 1, required: true },
    { name: "icon", type: "text", max: 16 },
    { name: "color", type: "text", max: 20 },
  ])
  make("transactions", [
    { name: "kind", type: "select", values: ["gasto", "ingreso"], maxSelect: 1, required: true },
    { name: "amount", type: "number", min: 0 },
    { name: "account", type: "text", max: 30 },
    { name: "category", type: "text", max: 30 },
    { name: "date", type: "text", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    { name: "note", type: "text", max: 300 },
  ])
}, (app) => {
  for (const n of ["transactions", "categories", "accounts"]) {
    app.delete(app.findCollectionByNameOrId(n))
  }
})
