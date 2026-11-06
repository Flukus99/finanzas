/// <reference path="../pb_data/types.d.ts" />
// Transferencias entre cuentas propias: el dinero sale de "account" y llega a "to".
migrate((app) => {
  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.getByName("kind").values = ["gasto", "ingreso", "ahorro", "retiro", "transferencia"]
  tx.fields.add(new TextField({ name: "to", max: 30 }))
  app.save(tx)
}, (app) => {
  const tx = app.findCollectionByNameOrId("transactions")
  tx.fields.removeByName("to")
  tx.fields.getByName("kind").values = ["gasto", "ingreso", "ahorro", "retiro"]
  app.save(tx)
})
